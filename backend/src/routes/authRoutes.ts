// src/routes/authRoutes.ts

import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db, supabase } from "../config/database.js";
import { generateToken } from "../middleware/auth.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

/**
 * POST /api/auth/register
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    /**
     * Supabase Auth handles:
     * 1. Checking if user exists
     * 2. Hashing the password securely
     * 3. Creating the user in the auth.users table
     */
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name || email.split("@")[0],
        },
      },
    });

    if (error) {
      // Supabase returns a 422 or 400 if user exists or password is too weak
      return res.status(error.status || 400).json({
        success: false,
        error: error.message,
      });
    }

    const user = data.user;
    const session = data.session;

    // Create user record in public.users table
    if (user?.id) {
      try {
        const { error: dbError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            email: user.email,
            name: name || user.user_metadata?.full_name || email.split("@")[0],
            password: "", // Empty password since auth is handled by Supabase
          });

        if (dbError) {
          logger.error("Failed to create user in public.users:", dbError);
          // Continue anyway - user might already exist
        } else {
          logger.info("✅ User created in public.users:", user.id);
        }
      } catch (err) {
        logger.error("Error creating user record:", err);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user?.id,
          email: user?.email,
          name: name || user?.user_metadata?.full_name || email.split("@")[0],
        },
        token: session?.access_token,
      },
      message: "User registered successfully",
    });
  } catch (error) {
    logger.error("Register error:", error);
    res.status(500).json({ success: false, error: "Failed to register user" });
  }
});

/**
 * POST /api/auth/login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      console.log("❌ Missing email or password");
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    // Supabase handles password verification internally
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Error 400/401: Invalid credentials
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    const user = data.user;
    const session = data.session;

    // Ensure user exists in public.users table and get user name
    let userName = user.user_metadata?.full_name || user.email?.split("@")[0];
    
    if (user?.id) {
      try {
        const { data: existingUser, error: checkError } = await supabase
          .from('users')
          .select('id, name')
          .eq('id', user.id)
          .single();

        if (checkError || !existingUser) {
          // User doesn't exist in public.users, create them
          logger.info("Creating user in public.users for login:", user.id);
          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: user.id,
              email: user.email,
              name: userName,
              password: "", // Empty password since auth is handled by Supabase
            });

          if (insertError) {
            logger.error("Failed to create user on login:", insertError);
            // Continue anyway
          }
        } else {
          // Use the name from the database
          userName = existingUser.name || userName;
        }
      } catch (err) {
        logger.error("Error checking/creating user on login:", err);
      }
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: userName,
        },
        token: session.access_token,
      },
      message: "Login successful",
    });
    console.log("✅ Response sent successfully");
  } catch (error) {
    console.error("❌ LOGIN ERROR:", error);
    logger.error("Login error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to login",
    });
  }
});

/**
 * POST /api/auth/sync-users-from-auth
 * Emergency endpoint: Sync all users from auth.users to public.users
 * Use this if you have orphaned auth users without public.users records
 */
router.post("/sync-users-from-auth", async (req, res) => {
  try {
    // Get all users from auth.users (only accessible with service role)
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      logger.error("Failed to list auth users:", authError);
      return res.status(500).json({ success: false, error: "Failed to fetch auth users" });
    }

    if (!authUsers?.users) {
      return res.json({ success: true, synced: 0, message: "No auth users found" });
    }

    logger.info(`Found ${authUsers.users.length} auth users, syncing to public.users...`);

    let synced = 0;
    let skipped = 0;

    for (const authUser of authUsers.users) {
      try {
        // Check if user exists in public.users
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('id', authUser.id)
          .single();

        if (!existingUser) {
          // Insert user into public.users
          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: authUser.id,
              email: authUser.email,
              name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0],
              password: "",
            });

          if (insertError) {
            logger.warn(`Failed to sync user ${authUser.id}:`, insertError);
            skipped++;
          } else {
            synced++;
            logger.info(`✅ Synced user: ${authUser.id}`);
          }
        } else {
          skipped++;
        }
      } catch (err) {
        logger.error(`Error syncing user ${authUser.id}:`, err);
        skipped++;
      }
    }

    res.json({
      success: true,
      synced,
      skipped,
      total: authUsers.users.length,
      message: `Synced ${synced} users, ${skipped} already existed`,
    });
  } catch (error) {
    logger.error("Sync users error:", error);
    res.status(500).json({ success: false, error: "Failed to sync users" });
  }
});

/**
 * GET /api/auth/me - Get current user info
 */
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }

    // Get user data from public.users table
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('id', user.id)
      .single();

    if (dbError) {
      logger.error("Failed to fetch user data:", dbError);
      return res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.email?.split("@")[0],
        },
      });
    }

    res.json({
      success: true,
      data: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
      },
    });
  } catch (error) {
    logger.error("Get user error:", error);
    res.status(500).json({ success: false, error: "Failed to get user data" });
  }
});

export const authRoutes = router;
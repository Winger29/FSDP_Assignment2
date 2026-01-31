// controllers/groupController.ts
import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { logger } from "../utils/logger";

export const createGroup = async (req: Request, res: Response) => {
  try {
    const { Group_Name, Group_Desc } = req.body;
    const userId = req.user?.id; 

    // 🧪 Validation
    if (!Group_Name || !Group_Desc) {
      return res.status(400).json({
        success: false,
        error: "Name and description required",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    // 1️⃣ Create group
    const { data: group, error: groupError } = await supabase
      .from("group")
      .insert([
        {
          Group_Name,
          Group_Desc,
        },
      ])
      .select()
      .single();

    if (groupError) throw groupError;

    // 2️⃣ Add creator to group_members
    const { error: memberError } = await supabase
      .from("group_members")
      .insert([
        {
          group_id: group.id,
          id: userId, 
          role: "Owner",
        },
      ]);

    if (memberError) {
      // Optional rollback
      await supabase.from("group").delete().eq("id", group.id);
      throw memberError;
    }

    // Match frontend expectation
    return res.status(201).json({
      group,
    });

  } catch (err: any) {
    console.error("Create group error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const getGroups = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        const { data: groups, error } = await supabase
            .from("group_members")
            .select(`
                group:group_id (id, Group_Name, Group_Desc)
            `)
            .eq("id", userId);  
        if (error) throw error;
        const formattedGroups = groups.map((gm) => gm.group);
        return res.status(200).json({
            groups: formattedGroups,
        });
    } catch (err: any) {
        console.error("Get groups error:", err);
        return res.status(500).json({
            success: false,
            error: err.message,
        });
    } 
};

export const createMessage = async (req: Request, res: Response) => {
  try {
    const { group_id, content } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }
    if (!group_id || !content) {
        return res.status(400).json({
            success: false,
            error: "Group ID and content required",
        });
    }
    const { data: message, error } = await supabase
      .from("group_messages")
        .insert([
            {
                group_id,
                user_id: userId,
                message: content,
        },
        ])
        .select()
        .single();
    if (error) throw error;
    return res.status(201).json({
        message,
    });
  } catch (err: any) {
    console.error("Create message error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        });
    }
    if (!groupId) {
        return res.status(400).json({
            success: false,
            error: "Group ID required",
        });
    }
    const { data: messages, error } = await supabase
        .from("group_messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });
    if (error) throw error;
    return res.status(200).json({
        messages,
    });
  }
    catch (err: any) {
    console.error("Get messages error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  } 
};

export const joinGroup = async (req: Request, res: Response) => {
  try {
    const { groupId } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }
    if (!groupId) {
        return res.status(400).json({
            success: false,
            error: "Group ID required",
        });
    }
    const { error } = await supabase
        .from("group_members")
        .insert([
            {
                group_id: groupId,
                id: userId,
                role: "Member",
        },
        ]);
    if (error) throw error;
    return res.status(200).json({
        success: true,
        message: "Joined group successfully",
    });
    } catch (err: any) {
    console.error("Join group error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const getRemainingGroups = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    // 🔹 Get group_ids the user has already joined
    const { data: joinedGroups, error: joinedError } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("id", userId);

    if (joinedError) throw joinedError;

    const joinedGroupIds = joinedGroups?.map((g) => g.group_id) || [];

    // 🔹 Get groups the user has NOT joined
    let query = supabase.from("group").select("*");
    if (joinedGroupIds.length > 0) {
      query = query.not("id", "in", `(${joinedGroupIds.join(",")})`);
    }

    const { data: remainingGroups, error: remainingError } = await query;
    if (remainingError) throw remainingError;

    return res.status(200).json({
      groups: remainingGroups,
    });
  } catch (err: any) {
    console.error("Get remaining groups error:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const getMemberRole = async (req: Request, res: Response) => {
    try {
        const { groupId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
            });
        }
        if (!groupId) {
            return res.status(400).json({
                success: false,
                error: "Group ID required",
            });
        }   
        const { data: member, error } = await supabase
            .from("group_members")
            .select("role")
            .eq("group_id", groupId)
            .eq("id", userId)
            .single();
        if (error) throw error;
        return res.status(200).json({
            role: member.role,
        });
    } catch (err: any) {
        console.error("Get member role error:", err);
        return res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

export const deleteGroup = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { groupId } = req.params;

  const { data: roleRow, error: roleErr } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("id", userId)
    .single();

  if (roleErr || roleRow?.role !== "Owner") {
    return res.status(403).json({ error: "Not authorized" });
  }

  const { error: msgErr } = await supabase
    .from("group_messages")
    .delete()
    .eq("group_id", groupId);

  if (msgErr) {
    return res.status(500).json({ error: msgErr.message });
  }

  const { error: memberErr } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId);

  if (memberErr) {
    return res.status(500).json({ error: memberErr.message });
  }

  const { error: groupErr } = await supabase
    .from("group")
    .delete()
    .eq("id", groupId);

  if (groupErr) {
    return res.status(500).json({ error: groupErr.message });
  }

  res.json({ success: true });
};

export const updateGroup = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { groupId } = req.params;
    const { Group_Name, Group_Desc } = req.body;
    const { data: roleRow, error: roleErr } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", groupId)
        .eq("id", userId)
        .single();
    if (roleErr || roleRow?.role !== "Owner") {
        return res.status(403).json({ error: "Not authorized" });
    }
    const { data: group, error: groupErr } = await supabase
        .from("group")
        .update({ Group_Name,  Group_Desc })
        .eq("id", groupId)
        .select()
        .single();
    if (groupErr) {
        return res.status(500).json({ error: groupErr.message });
    }
    res.json({ success: true, group });
};

export const getAllAgents = async (req: Request, res: Response) => {
  try {
    // Expect authenticated user ID in req.user
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .eq("user_id", userId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (error) {
        logger?.error("Failed to fetch agents:", error);
        return res.status(500).json({ success: false, error: "Database error" });
      }

      // Ensure we always return an array
      const agents = Array.isArray(data) ? data : data ? [data] : [];

      return res.json({ success: true, data: agents });
    } catch (err) {
      logger?.error("Unexpected error fetching agents:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  };

export const addAgentToGroup = async (req: Request, res: Response) => {
  try {
    const { agent_id, group_id } = req.body;

    if (!agent_id || !group_id) {
      return res.status(400).json({ success: false, error: "Missing agent_id or group_id" });
    }

    // Just insert the agent into group_agents
    const { data, error } = await supabase
      .from("group_agents")
      .insert([{
        Group_id:group_id,
        Agent_id:agent_id
      }]);

    if (error) {
      console.error("Failed to add agent to group:", error);
      return res.status(500).json({ success: false, error: "Failed to add agent to group" });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error("Error in addAgentToGroup:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

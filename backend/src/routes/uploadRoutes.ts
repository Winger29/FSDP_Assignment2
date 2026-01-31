// src/routes/uploadRoutes.ts

import express, { Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { uploadService } from "../services/uploadService";
import { logger } from "../utils/logger";
import path from "path";
import fs from "fs";

const router = express.Router();

// All upload routes require authentication
router.use(authenticateToken);

// Upload file for message
router.post(
  "/messages/:messageId",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { messageId } = req.params;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      // Validate file
      const validation = uploadService.validateFile(file);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      // Save attachment
      const attachment = await uploadService.saveMessageAttachment(
        messageId,
        file
      );

      res.json({
        success: true,
        data: attachment,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message || "Upload failed" });
    }
  }
);

// Upload file for task
router.post(
  "/tasks/:taskId",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { taskId } = req.params;
      const userId = (req as any).user?.id; // Changed from userId to id
      const file = req.file;

      logger.info(`Task upload request: taskId=${taskId}, userId=${userId}, file=${file?.originalname}`);

      if (!file) {
        logger.warn("No file in upload request");
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      if (!userId) {
        logger.warn("No userId in upload request");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Validate file
      const validation = uploadService.validateFile(file);
      if (!validation.valid) {
        logger.warn(`File validation failed: ${validation.error}`);
        res.status(400).json({ error: validation.error });
        return;
      }

      logger.info(`Saving task attachment: ${file.originalname}`);
      // Save attachment
      const attachment = await uploadService.saveTaskAttachment(
        taskId,
        userId,
        file
      );

      logger.info(`Task attachment saved successfully: ${attachment.id}`);
      res.json({
        success: true,
        data: attachment,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message || "Upload failed" });
    }
  }
);

// Get attachments for a message
router.get(
  "/messages/:messageId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { messageId } = req.params;
      const attachments = await uploadService.getMessageAttachments(messageId);

      res.json({
        success: true,
        data: attachments,
      });
    } catch (error: any) {
      console.error("Get attachments error:", error);
      res.status(500).json({ error: error.message || "Failed to get attachments" });
    }
  }
);

// Get attachments for a task
router.get(
  "/tasks/:taskId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { taskId } = req.params;
      const attachments = await uploadService.getTaskAttachments(taskId);

      res.json({
        success: true,
        data: attachments,
      });
    } catch (error: any) {
      console.error("Get attachments error:", error);
      res.status(500).json({ error: error.message || "Failed to get attachments" });
    }
  }
);

// Download/view file
router.get(
  "/files/:type/:fileName",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { type, fileName } = req.params;

      if (type !== "conversation" && type !== "task") {
        res.status(400).json({ error: "Invalid file type" });
        return;
      }

      const filePath = uploadService.getFilePath(fileName, type as "conversation" | "task");

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      res.sendFile(filePath);
    } catch (error: any) {
      console.error("Download error:", error);
      res.status(500).json({ error: error.message || "Download failed" });
    }
  }
);

// Delete attachment
router.delete(
  "/:type/:attachmentId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { type, attachmentId } = req.params;

      if (type !== "message" && type !== "task") {
        res.status(400).json({ error: "Invalid attachment type" });
        return;
      }

      await uploadService.deleteAttachment(
        attachmentId,
        type as "message" | "task"
      );

      res.json({
        success: true,
        message: "Attachment deleted successfully",
      });
    } catch (error: any) {
      console.error("Delete error:", error);
      res.status(500).json({ error: error.message || "Delete failed" });
    }
  }
);

export { router as uploadRoutes };

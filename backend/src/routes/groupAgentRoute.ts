import express from "express";
import { chatWithAgent, sendUserMessageToAgent, getAgentHistory } from "../controllers/groupAgentController";

const router = express.Router();

router.post("/chat", chatWithAgent); 
router.post("/send", sendUserMessageToAgent); 
router.get("/history", getAgentHistory); 

export { router as groupAgentRoute };

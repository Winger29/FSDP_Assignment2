import { Router } from "express";
import { createGroup,getGroups,createMessage,getMessages, getRemainingGroups, joinGroup, getMemberRole, deleteGroup, updateGroup, getAllAgents, addAgentToGroup} from "../controllers/groupController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

router.post("/", authenticateToken, createGroup);
router.post("/addAgent", authenticateToken, addAgentToGroup);
router.get("/", authenticateToken, getGroups);
router.post("/:groupId/messages", authenticateToken, createMessage);
router.get("/:groupId/messages", authenticateToken, getMessages);
router.get("/remaining", authenticateToken, getRemainingGroups);
router.post("/join", authenticateToken, joinGroup);
router.get("/member-role/:groupId", authenticateToken, getMemberRole);
router.delete("/:groupId", authenticateToken, deleteGroup);
router.put("/:groupId", authenticateToken, updateGroup);
router.get("/agents", authenticateToken, getAllAgents);

export { router as groupRoutes };


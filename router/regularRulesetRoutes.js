import express from "express";
import { getRuleset, upsertRuleset } from "../controllers/regularRulesetController.js";
import { authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", getRuleset);

router.post("/", authorize(["Supervisor","supervisor"]), upsertRuleset);

export default router;

import express from "express";
import { getCampaigns, upsertCampaign,deleteCampaign } from "../controllers/campaignController.js";

const router = express.Router();

router.get("/get", getCampaigns);
router.post("/upsert", upsertCampaign);
router.delete("/:id", deleteCampaign);

export default router;

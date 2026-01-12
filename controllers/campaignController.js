import { Op } from "sequelize";
import Campaign from "../models/Campaign_id_mapping.js";


export const getCampaigns = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = search
      ? {
          [Op.or]: [
            { campign_id: { [Op.iLike]: `%${search}%` } },
            { campign_name: { [Op.iLike]: `%${search}%` } },
            { state: { [Op.iLike]: `%${search}%` } },
            { stream: { [Op.iLike]: `%${search}%` } },
            { degree: { [Op.iLike]: `%${search}%` } },
          ],
        }
      : {};

    const { count: total, rows: campaigns } = await Campaign.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["created_at", "DESC"]],
    });

    res.json({
      data: campaigns,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Error fetching campaigns:", err);
    res.status(500).json({ message: "Server Error" });
  }
};


export const upsertCampaign = async (req, res) => {
  try {
    const {
      campign_id,
      campign_name,
      camp_name,
      state,
      stream,
      degree,
      mode,
    } = req.body;
    console.log(req.body)
    if (!campign_id || !state || !stream || !degree || !mode) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [campaign, created] = await Campaign.upsert(
      {
        campign_id,
        campign_name,
        state,
        stream,
        degree,
        mode,
      },
      { returning: true } 
    );

    res.json({
      message: created
        ? "Campaign created successfully"
        : "Campaign updated successfully",
      data: campaign,
    });
  } catch (err) {
    console.error("Error upserting campaign:", err);
    res.status(500).json({ message: "Server Error" });
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Campaign.destroy({
      where: { campign_id:id },
    });
    if (!deleted) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    res.json({ message: "Campaign deleted successfully" });
  } catch (err) {
    console.error("Error deleting campaign:", err);
    res.status(500).json({ message: "Server Error" });
  }
};

import UniversityBrochure from "../models/UniversityBrochure.js";
import { uploadToCloudinary } from "../config/cloudinary.js";

export const uploadUniversityBrochure = async (req, res) => {
  try {
    const { universityName } = req.params;
    const brochureFile = req.file;

    if (!universityName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "University name is required",
      });
    }

    if (!brochureFile) {
      return res.status(400).json({
        success: false,
        message: "Brochure file is required",
      });
    }

    const decodedUniversityName = decodeURIComponent(universityName).trim();

    const timestamp = Date.now();
    const originalName = brochureFile.originalname.replace(/\.[^/.]+$/, "");
    const fileName = `brochure_${originalName}_${timestamp}`;

    const uploadedBrochureUrl = await uploadToCloudinary(
      brochureFile.buffer,
      fileName
    );

    const existingBrochure = await UniversityBrochure.findOne({
      where: { university_name: decodedUniversityName },
    });

    let brochure;

    if (existingBrochure) {
      brochure = await existingBrochure.update({
        brochure_url: uploadedBrochureUrl,
      });
    } else {
      brochure = await UniversityBrochure.create({
        university_name: decodedUniversityName,
        brochure_url: uploadedBrochureUrl,
      });
    }

    return res.status(200).json({
      success: true,
      message: existingBrochure
        ? "University brochure updated successfully"
        : "University brochure uploaded successfully",
      brochureUrl: uploadedBrochureUrl,
      data: brochure,
    });
  } catch (error) {
    console.error("uploadUniversityBrochure error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while uploading brochure",
      error: error.message,
    });
  }
};

export const getUniversityBrochure = async (req, res) => {
  try {
    const { universityName } = req.params;

    if (!universityName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "University name is required",
      });
    }

    const decodedUniversityName = decodeURIComponent(universityName).trim();

    const brochure = await UniversityBrochure.findOne({
      where: { university_name: decodedUniversityName },
    });

    if (!brochure) {
      return res.status(404).json({
        success: false,
        message: `Brochure not found for ${decodedUniversityName}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: brochure,
    });
  } catch (error) {
    console.error("getUniversityBrochure error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching brochure",
      error: error.message,
    });
  }
};

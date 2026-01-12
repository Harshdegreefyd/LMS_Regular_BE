import express from "express";
import multer from "multer";
import {
  uploadUniversityBrochure,
  getUniversityBrochure,
} from "../controllers/univeristyBrochure.controller.js";

const router = express.Router();

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, 
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "image/jpg",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only PDF, DOC, DOCX, JPEG, PNG files are allowed."
        )
      );
    }
  },
});


router.post(
  "/:universityName",
  upload.single("brochure"),
  uploadUniversityBrochure
);

router.get(
  "/:universityName",
  getUniversityBrochure
);

export default router;

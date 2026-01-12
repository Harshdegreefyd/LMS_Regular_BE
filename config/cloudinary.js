import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "ddnlcnk4n",
  api_key: process.env.CLOUDINARY_API_KEY || "926369151961374",
  api_secret: process.env.CLOUDINARY_API_SECRET || "SSAWvSK-VltUMpkthHvHR7VTPU8"
});

export const uploadToCloudinary = async (fileBuffer, fileName) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "auto", public_id: fileName },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );
    uploadStream.end(fileBuffer);
  });
};

const fs = require("fs");

const path = require("path");

const multer = require("multer");

const crypto = require("crypto");



const uploadsDir = path.join(__dirname, "..", "public", "uploads");

fs.mkdirSync(uploadsDir, { recursive: true });



function safeExtension(originalName = "", mimetype = "") {

  const ext = path.extname(originalName).toLowerCase();



  if ([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm"].includes(ext)) {

    return ext;

  }



  if (mimetype === "image/jpeg") return ".jpg";

  if (mimetype === "image/png") return ".png";

  if (mimetype === "image/webp") return ".webp";

  if (mimetype === "video/mp4") return ".mp4";

  if (mimetype === "video/quicktime") return ".mov";

  if (mimetype === "video/webm") return ".webm";



  return ".bin";

}



const storage = multer.diskStorage({

  destination: (_req, _file, cb) => {

    cb(null, uploadsDir);

  },

  filename: (_req, file, cb) => {

    const ext = safeExtension(file.originalname || "", file.mimetype || "");

    const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;

    cb(null, name);

  },

});



const upload = multer({

  storage,

  limits: {

    fileSize: 50 * 1024 * 1024,

  },

  fileFilter: (_req, file, cb) => {

    const allowed = [

      "image/jpeg",

      "image/png",

      "image/webp",

      "video/mp4",

      "video/quicktime",

      "video/webm",

    ];



    const ok = allowed.includes(file.mimetype);

    cb(ok ? null : new Error("Only images and videos are allowed"), ok);

  },

});



module.exports = {

  upload,

  uploadsDir,

};
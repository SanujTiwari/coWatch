const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `avatar-${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed[ext] === file.mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpeg, jpg, png, webp, gif) are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const matchesImageSignature = (buffer, mime) => {
  if (mime === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/gif') return buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
  if (mime === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
};

const validateAvatar = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const file = await fs.promises.open(req.file.path, 'r');
    let header;
    try {
      const buffer = Buffer.alloc(12);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      header = buffer.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
    if (!matchesImageSignature(header, req.file.mimetype)) {
      await fs.promises.unlink(req.file.path);
      return res.status(400).json({ message: 'File content does not match the image type' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { upload, validateAvatar, UPLOAD_DIR };

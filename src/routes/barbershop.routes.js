const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const checkRole = require("../middleware/checkRole.middleware");
const upload = require("../middleware/upload.middleware");
const BarbershopController = require("../controllers/barbershop.controller");
const serviceRoutes = require("./service.routes");
const staffRoutes = require("./staff.routes");
const uploadImages = require("../middleware/uploadImages.middleware"); // <-- TAMBAHKAN INI

const ownerMiddleware = [authMiddleware, checkRole("owner")];

// =================================================================
// --- Rute Publik (Untuk Customer App, Tidak Perlu Login) ---
// =================================================================

// GET /api/barbershops
router.get("/", BarbershopController.getAllApprovedBarbershops);

// GET /api/barbershops/detail/:id
router.get("/detail/:id", BarbershopController.getBarbershopDetailsById);

// =================================================================
// --- Rute Customer (Perlu Login) ---
// =================================================================

// POST /api/barbershops/register
router.post(
  "/register",
  authMiddleware,
  upload.fields([
    { name: "ktp", maxCount: 1 },
    { name: "permit", maxCount: 1 },
  ]),
  BarbershopController.registerBarbershop
);

// GET /api/barbershops/my-application
router.get(
  "/my-application",
  authMiddleware,
  BarbershopController.getMyApplicationStatus
);

// =================================================================
// --- Rute Owner (Perlu Login & Role Owner) ---
// =================================================================

// GET /api/barbershops/my-barbershops
router.get(
  "/my-barbershops",
  ownerMiddleware,
  BarbershopController.getMyBarbershops
);

// GET /api/barbershops/my/:barbershopId
router.get(
  "/my/:barbershopId",
  ownerMiddleware,
  BarbershopController.getMyBarbershopById
);

// PUT /api/barbershops/:barbershopId
router.put(
  "/:barbershopId",
  ownerMiddleware,
  upload.fields([
    { name: "ktp", maxCount: 1 },
    { name: "permit", maxCount: 1 },
  ]),
  BarbershopController.updateMyBarbershop
);
// UPDATE LOKASI
router.patch(
  "/:barbershopId/location",
  ownerMiddleware,
  BarbershopController.updateBarbershopLocation
);

// PATCH /api/barbershops/:barbershopId/resubmit
router.patch(
  "/:barbershopId/resubmit",
  ownerMiddleware,
  BarbershopController.resubmitBarbershop
);

// GET /api/barbershops/:barbershopId/kpis
router.get(
  "/:barbershopId/kpis",
  ownerMiddleware,
  BarbershopController.getBarbershopKpis
);

// ✅ NEW: Upload main image
router.post(
  "/:barbershopId/upload-image",
  ownerMiddleware,
  uploadImages.single("image"),
  BarbershopController.uploadMainImage
);

// ✅ NEW: Get gallery images
router.get("/:barbershopId/gallery", BarbershopController.getGalleryImages);

// Mount nested routes dengan :barbershopId
// URL akan menjadi: /api/barbershops/:barbershopId/services
router.use("/:barbershopId/services", serviceRoutes);

// URL akan menjadi: /api/barbershops/:barbershopId/staff <-- TAMBAHKAN INI
router.use("/:barbershopId/staff", staffRoutes);

module.exports = router;

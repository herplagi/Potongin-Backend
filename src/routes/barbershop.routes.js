// src/routes/barbershop.routes.js - UPDATED
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const checkRole = require("../middleware/checkRole.middleware");
const upload = require("../middleware/upload.middleware");
const BarbershopController = require("../controllers/barbershop.controller");
const serviceRoutes = require("./service.routes");
const staffRoutes = require("./staff.routes");
// const scheduleRoutes = require("./schedule.routes"); // ✅ NEW
const uploadImages = require("../middleware/uploadImages.middleware");

const ownerMiddleware = [authMiddleware, checkRole("owner")];

// =================================================================
// --- Rute Publik (Untuk Customer App, Tidak Perlu Login) ---
// =================================================================

router.get("/", BarbershopController.getAllApprovedBarbershops);
router.get("/detail/:id", BarbershopController.getBarbershopDetailsById);

// =================================================================
// --- Rute Customer (Perlu Login) ---
// =================================================================

router.post(
  "/register",
  authMiddleware,
  upload.fields([
    { name: "ktp", maxCount: 1 },
    { name: "permit", maxCount: 1 },
  ]),
  BarbershopController.registerBarbershop
);

router.get(
  "/my-application",
  authMiddleware,
  BarbershopController.getMyApplicationStatus
);

// =================================================================
// --- Rute Owner (Perlu Login & Role Owner) ---
// =================================================================

router.get(
  "/my-barbershops",
  ownerMiddleware,
  BarbershopController.getMyBarbershops
);

router.get(
  "/my/:barbershopId",
  ownerMiddleware,
  BarbershopController.getMyBarbershopById
);

router.put(
  "/:barbershopId",
  ownerMiddleware,
  upload.fields([
    { name: "ktp", maxCount: 1 },
    { name: "permit", maxCount: 1 },
  ]),
  BarbershopController.updateMyBarbershop
);

router.patch(
  "/:barbershopId/location",
  ownerMiddleware,
  BarbershopController.updateBarbershopLocation
);

router.patch(
  "/:barbershopId/resubmit",
  ownerMiddleware,
  BarbershopController.resubmitBarbershop
);

router.get(
  "/:barbershopId/kpis",
  ownerMiddleware,
  BarbershopController.getBarbershopKpis
);

router.get(
  "/:barbershopId/reports/transactions",
  ownerMiddleware,
  BarbershopController.getTransactionReport
);

router.patch(
  "/:barbershopId/description",
  ownerMiddleware,
  BarbershopController.updateBarbershopDescription
);

router.post(
  "/:barbershopId/upload-image",
  ownerMiddleware,
  uploadImages.single("image"),
  BarbershopController.uploadMainImage
);

router.get("/:barbershopId/gallery", BarbershopController.getGalleryImages);

// Mount nested routes dengan :barbershopId
router.use("/:barbershopId/services", serviceRoutes);
router.use("/:barbershopId/staff", staffRoutes);
// router.use("/:barbershopId/schedule", scheduleRoutes); // ✅ NEW

module.exports = router;
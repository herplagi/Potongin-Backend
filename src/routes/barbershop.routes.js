// src/routes/barbershop.routes.js - COMPLETE FIXED VERSION
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const checkRole = require("../middleware/checkRole.middleware");
const upload = require("../middleware/upload.middleware");
const BarbershopController = require("../controllers/barbershop.controller");
const serviceRoutes = require("./service.routes");
const staffRoutes = require("./staff.routes");
const scheduleRoutes = require("./schedule.routes");
const uploadImages = require("../middleware/uploadImages.middleware");

const ownerMiddleware = [authMiddleware, checkRole("owner")];

// =================================================================
// --- RUTE PUBLIK (Tanpa Authentication) ---
// =================================================================

// General public routes - HARUS DI ATAS route dengan :barbershopId
router.get("/", BarbershopController.getAllApprovedBarbershops);
router.get("/trending", BarbershopController.getTrendingBarbershops);
router.get("/statistics", BarbershopController.getStatistics);

// ✅ NEW: Facilities routes (must be BEFORE :barbershopId routes)
router.get("/facilities/all", BarbershopController.getAllFacilities);

// Public routes dengan :barbershopId parameter
router.get("/detail/:id", BarbershopController.getBarbershopDetailsById);
router.get("/:barbershopId/hours", BarbershopController.getBarbershopHours);
router.get("/:barbershopId/facilities", BarbershopController.getBarbershopFacilities);
router.get("/:barbershopId/gallery", BarbershopController.getBarbershopGallery);
router.get("/:barbershopId/popular-services", BarbershopController.getPopularServices);

// =================================================================
// --- RUTE CUSTOMER (Butuh Authentication) ---
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
// --- RUTE OWNER (Butuh Authentication + Role Owner) ---
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

router.get(
  "/:barbershopId/chart-data",
  ownerMiddleware,
  BarbershopController.getWeeklyChartData
);

// ✅ NEW: Owner facilities management
router.post(
  "/:barbershopId/facilities",
  ownerMiddleware,
  BarbershopController.updateBarbershopFacilities
);

// =================================================================
// --- NESTED ROUTES (Harus di paling bawah) ---
// =================================================================

router.use("/:barbershopId/services", serviceRoutes);
router.use("/:barbershopId/staff", staffRoutes);
router.use("/:barbershopId/schedule", scheduleRoutes);

module.exports = router;
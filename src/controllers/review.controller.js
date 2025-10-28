// src/controllers/review.controller.js
const Review = require("../models/Review.model");
const Booking = require("../models/Booking.model");
const User = require("../models/User.model");
const Barbershop = require("../models/Barbershop.model");
const Service = require("../models/Service.model");
const { Op } = require("sequelize");

// ===== CUSTOMER FUNCTIONS =====

/**
 * Check if customer can review a specific booking
 */
exports.checkCanReview = async (req, res) => {
  try {
    const { booking_id } = req.params;
    const customerId = req.user.id;

    // Check if booking exists and belongs to customer
    const booking = await Booking.findOne({
      where: {
        booking_id,
        customer_id: customerId,
        status: "completed", // Only completed bookings can be reviewed
      },
    });

    if (!booking) {
      return res.status(404).json({
        canReview: false,
        message: "Booking tidak ditemukan atau belum selesai",
      });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({
      where: { booking_id },
    });

    if (existingReview) {
      return res.status(200).json({
        canReview: false,
        hasReview: true,
        message: "Anda sudah memberikan review untuk booking ini",
      });
    }

    res.status(200).json({
      canReview: true,
      hasReview: false,
      message: "Anda dapat memberikan review",
    });
  } catch (error) {
    console.error("Check can review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Create a new review
 */
exports.createReview = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { booking_id, rating, title, comment } = req.body;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating harus antara 1-5" });
    }

    // Check if booking exists and belongs to customer
    const booking = await Booking.findOne({
      where: {
        booking_id,
        customer_id: customerId,
        status: "completed",
      },
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking tidak ditemukan atau belum selesai",
      });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({
      where: { booking_id },
    });

    if (existingReview) {
      return res.status(400).json({
        message: "Anda sudah memberikan review untuk booking ini",
      });
    }

    // Create review
    const newReview = await Review.create({
      booking_id,
      customer_id: customerId,
      barbershop_id: booking.barbershop_id,
      rating,
      title: title || `Review untuk ${booking.barbershop_id}`,
      comment: comment || "",
      status: "approved", // Auto-approve for now, can be changed to 'pending'
    });

    res.status(201).json({
      message: "Review berhasil dibuat",
      review: newReview,
    });
  } catch (error) {
    console.error("Create review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get customer's own reviews
 */
exports.getMyReviews = async (req, res) => {
  try {
    const customerId = req.user.id;

    const reviews = await Review.findAll({
      where: { customer_id: customerId },
      include: [
        {
          model: Barbershop,
          attributes: ["barbershop_id", "name", "city"],
        },
        {
          model: Booking,
          include: [
            {
              model: Service,
              attributes: ["name", "price"],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json(reviews);
  } catch (error) {
    console.error("Get my reviews error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ===== PUBLIC FUNCTIONS =====

/**
 * Get public reviews for a barbershop (for customer app preview)
 */
exports.getPublicBarbershopReviews = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    const reviews = await Review.findAll({
      where: {
        barbershop_id: barbershopId,
        status: "approved",
      },
      include: [
        {
          model: User,
          as: "customer",
          attributes: ["name"], // Only show customer name
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Calculate average rating
    const avgRating = await Review.findOne({
      where: {
        barbershop_id: barbershopId,
        status: "approved",
      },
      attributes: [
        [
          Review.sequelize.fn("AVG", Review.sequelize.col("rating")),
          "averageRating",
        ],
        [
          Review.sequelize.fn("COUNT", Review.sequelize.col("review_id")),
          "totalReviews",
        ],
      ],
      raw: true,
    });

    res.status(200).json({
      reviews,
      stats: {
        averageRating: parseFloat(avgRating.averageRating || 0).toFixed(1),
        totalReviews: parseInt(avgRating.totalReviews || 0),
      },
    });
  } catch (error) {
    console.error("Get public reviews error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ===== OWNER FUNCTIONS =====

/**
 * Get reviews for owner's barbershop
 */
exports.getOwnerBarbershopReviews = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const ownerId = req.user.id;

    console.log("🔍 Fetching reviews for:", { barbershopId, ownerId });

    // Verify ownership
    const barbershop = await Barbershop.findOne({
      where: {
        barbershop_id: barbershopId,
        owner_id: ownerId,
      },
    });

    if (!barbershop) {
      console.log("❌ Barbershop not found or access denied");
      return res.status(403).json({ message: "Akses ditolak" });
    }

    console.log("✅ Barbershop verified:", barbershop.name);

    const reviews = await Review.findAll({
      where: { barbershop_id: barbershopId },
      include: [
        {
          model: User,
          as: "customer",
          attributes: ["name", "email"],
        },
        {
          model: Booking,
          include: [
            {
              model: Service,
              attributes: ["name"],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    console.log("📊 Reviews found:", reviews.length);

    // ✅ Always return array
    res.status(200).json(reviews || []);
  } catch (error) {
    console.error("❌ Get owner reviews error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// ===== ADMIN FUNCTIONS =====

/**
 * Get all reviews (for admin dashboard)
 */
exports.getAllReviews = async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    const whereClause = status ? { status } : {};

    const reviews = await Review.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "customer",
          attributes: ["name", "email"],
        },
        {
          model: Barbershop,
          attributes: ["name", "city"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.status(200).json(reviews);
  } catch (error) {
    console.error("Get all reviews error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get review statistics
 */
exports.getReviewStats = async (req, res) => {
  try {
    const totalReviews = await Review.count();
    const approvedReviews = await Review.count({
      where: { is_approved: true },
    });
    const rejectedReviews = await Review.count({
      where: { is_approved: false },
    });
    const pendingReviews = await Review.count({ where: { is_approved: null } });

    const avgRating = await Review.findOne({
      attributes: [
        [
          Review.sequelize.fn("AVG", Review.sequelize.col("rating")),
          "averageRating",
        ],
      ],
      raw: true,
    });

    res.status(200).json({
      totalReviews,
      approvedReviews,
      rejectedReviews,
      pendingReviews,
      averageRating: parseFloat(avgRating.averageRating || 0).toFixed(1),
    });
  } catch (error) {
    console.error("Get review stats error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Moderate review (approve/reject)
 */
exports.moderateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { status, rejection_reason } = req.body;
    const adminId = req.user.id;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status harus approved atau rejected",
      });
    }

    const review = await Review.findByPk(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review tidak ditemukan" });
    }

    await review.update({
      status,
      rejection_reason: status === "rejected" ? rejection_reason : null,
      verified_by: adminId,
    });

    res.status(200).json({
      message: `Review berhasil di-${
        status === "approved" ? "setujui" : "tolak"
      }`,
      review,
    });
  } catch (error) {
    console.error("Moderate review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Delete review
 */
exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findByPk(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review tidak ditemukan" });
    }

    await review.destroy();

    res.status(200).json({ message: "Review berhasil dihapus" });
  } catch (error) {
    console.error("Delete review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

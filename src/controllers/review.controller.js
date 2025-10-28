// src/controllers/review.controller.js - FIXED VERSION
const Review = require("../models/Review.model");
const Booking = require("../models/Booking.model");
const User = require("../models/User.model");
const Barbershop = require("../models/Barbershop.model");
const Service = require("../models/Service.model");
const { Op } = require("sequelize");

// ===== CUSTOMER FUNCTIONS =====

exports.checkCanReview = async (req, res) => {
  try {
    const { booking_id } = req.params;
    const customerId = req.user.id;

    const booking = await Booking.findOne({
      where: {
        booking_id,
        customer_id: customerId,
        status: "completed",
      },
    });

    if (!booking) {
      return res.status(404).json({
        canReview: false,
        message: "Booking tidak ditemukan atau belum selesai",
      });
    }

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

exports.createReview = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { booking_id, rating, title, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating harus antara 1-5" });
    }

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

    const existingReview = await Review.findOne({
      where: { booking_id },
    });

    if (existingReview) {
      return res.status(400).json({
        message: "Anda sudah memberikan review untuk booking ini",
      });
    }

    const newReview = await Review.create({
      booking_id,
      customer_id: customerId,
      barbershop_id: booking.barbershop_id,
      rating,
      title: title || null,
      comment: comment || null,
      status: "approved", // Auto-approve
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
          attributes: ["name"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

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

exports.getOwnerBarbershopReviews = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const ownerId = req.user.id;

    const barbershop = await Barbershop.findOne({
      where: {
        barbershop_id: barbershopId,
        owner_id: ownerId,
      },
    });

    if (!barbershop) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const reviews = await Review.findAll({
      where: { 
        barbershop_id: barbershopId,
        status: 'approved' // Owner hanya lihat yang approved
      },
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

    res.status(200).json(reviews || []);
  } catch (error) {
    console.error("Get owner reviews error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// ===== ADMIN FUNCTIONS =====

exports.getAllReviews = async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;

    console.log('📊 GET ALL REVIEWS - Params:', { status, limit, offset });

    const whereClause = status && status !== 'all' ? { status } : {};

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
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    console.log('✅ Reviews found:', reviews.length);
    res.status(200).json(reviews);
  } catch (error) {
    console.error("❌ Get all reviews error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getReviewStats = async (req, res) => {
  try {
    const totalReviews = await Review.count();
    const approvedReviews = await Review.count({ where: { status: "approved" } });
    const rejectedReviews = await Review.count({ where: { status: "rejected" } });
    const pendingReviews = await Review.count({ where: { status: "pending" } });

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

exports.moderateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { status, rejection_reason, admin_note, is_flagged } = req.body;
    const adminId = req.user.id;

    console.log('🔧 MODERATE REVIEW:', { reviewId, status, adminId });

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        message: "Status harus approved, rejected, atau pending",
      });
    }

    const review = await Review.findByPk(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review tidak ditemukan" });
    }

    const updateData = {
      status,
      moderated_by: adminId,
      moderated_at: new Date(),
    };

    if (rejection_reason) {
      updateData.rejection_reason = rejection_reason;
    }

    if (admin_note) {
      updateData.admin_note = admin_note;
    }

    if (is_flagged !== undefined) {
      updateData.is_flagged = is_flagged;
    }

    await review.update(updateData);

    console.log('✅ Review moderated successfully');

    res.status(200).json({
      message: `Review berhasil di-${
        status === "approved" ? "setujui" : status === "rejected" ? "tolak" : "update"
      }`,
      review,
    });
  } catch (error) {
    console.error("❌ Moderate review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    console.log('🗑️ DELETE REVIEW:', reviewId);

    const review = await Review.findByPk(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review tidak ditemukan" });
    }

    await review.destroy();

    console.log('✅ Review deleted successfully');

    res.status(200).json({ message: "Review berhasil dihapus" });
  } catch (error) {
    console.error("❌ Delete review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
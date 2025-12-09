const mongoose = require("mongoose");

/**
 * Virtual Portfolio Model
 * User's virtual/paper trading portfolio
 */
const VirtualPortfolioSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },

        // Starting virtual cash
        initialCash: {
            type: Number,
            default: 10000, // $10,000 starting balance
            required: true
        },

        // Current available cash
        availableCash: {
            type: Number,
            default: 10000,
            required: true
        },

        // Holdings
        holdings: [
            {
                symbol: {
                    type: String,
                    required: true
                },
                name: {
                    type: String,
                    required: true
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 0
                },
                averagePrice: {
                    type: Number,
                    required: true
                },
                totalCost: {
                    type: Number,
                    required: true
                },
                addedAt: {
                    type: Date,
                    default: Date.now
                }
            }
        ],

        // Transaction history
        transactions: [
            {
                type: {
                    type: String,
                    enum: ["buy", "sell"],
                    required: true
                },
                symbol: String,
                name: String,
                quantity: Number,
                price: Number,
                total: Number,
                date: {
                    type: Date,
                    default: Date.now
                }
            }
        ],

        // Performance tracking
        totalValue: {
            type: Number,
            default: 10000
        },

        totalReturn: {
            type: Number,
            default: 0
        },

        totalReturnPercent: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("VirtualPortfolio", VirtualPortfolioSchema);

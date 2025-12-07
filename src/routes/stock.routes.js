const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const {
    searchStocks,
    getStockDetails,
    getPriceComparison,
    getQuote,
    getPopularStocks
} = require("../controllers/stock.controller");

// Public routes (no auth required for browsing stocks)
router.get("/search", searchStocks);
router.get("/popular", getPopularStocks);
router.get("/:symbol", getStockDetails);
router.get("/:symbol/prices", getPriceComparison);
router.get("/:symbol/quote", getQuote);

module.exports = router;

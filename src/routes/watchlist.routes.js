const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const {
    addToWatchlist,
    getWatchlist,
    getWatchlistWithPrices,
    removeFromWatchlist,
    updateWatchlistItem
} = require("../controllers/watchlist.controller");

// All watchlist routes require authentication
router.post("/", auth, addToWatchlist);
router.get("/", auth, getWatchlist);
router.get("/with-prices", auth, getWatchlistWithPrices);
router.delete("/:id", auth, removeFromWatchlist);
router.put("/:id", auth, updateWatchlistItem);

module.exports = router;

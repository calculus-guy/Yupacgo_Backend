const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const {
    getOverview,
    getHoldings,
    addHolding,
    removeHolding,
    getTransactions,
    resetPortfolio
} = require("../controllers/virtualPortfolio.controller");

// All portfolio routes require authentication
router.get("/overview", auth, getOverview);
router.get("/holdings", auth, getHoldings);
router.post("/holdings", auth, addHolding);
router.delete("/holdings/:symbol", auth, removeHolding);
router.get("/transactions", auth, getTransactions);
router.post("/reset", auth, resetPortfolio);

module.exports = router;

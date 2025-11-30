const Onboarding = require("../models/onboarding.models");
const User = require("../models/user.models");

exports.saveOnboarding = async (req, res) => {
    try {
        const userId = req.user.userId;

        const {
            goal,
            risk,
            duration,
            budget,
            interest,
            experience,
            approach
        } = req.body;

        if (!goal || !risk || !duration || !budget || !experience || !approach)
            return res.json({ status: "error", message: "Missing required fields" });

        let record = await Onboarding.findOne({ userId });

        if (record) {
            record.goal = goal;
            record.risk = risk;
            record.duration = duration;
            record.budget = budget;
            record.interest = interest;
            record.experience = experience;
            record.approach = approach;
            await record.save();
        } else {
            record = await Onboarding.create({
                userId,
                goal,
                risk,
                duration,
                budget,
                interest,
                experience,
                approach
            });

            await User.findByIdAndUpdate(userId, { onboarding: record._id });
        }

        return res.json({
            status: "success",
            message: "Onboarding saved",
            data: record
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};


exports.getOnboarding = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate("onboarding");

    if (!user || !user.onboarding) {
      return res.status(404).json({
        success: false,
        message: "No onboarding data found"
      });
    }

    res.status(200).json({
      success: true,
      data: user.onboarding
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
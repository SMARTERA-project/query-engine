const mongoose = require("mongoose");

const key = mongoose.Schema(
  {
    key: { type: String, required: true },
    visibility: { type: Array, required: true },
  },
  { versionKey: false }
);

module.exports = mongoose.model("key", key);
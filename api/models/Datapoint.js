const mongoose = require('mongoose');

const datapointSchema = new mongoose.Schema({
  source: String,
  survey: String,
  surveyName: String,
  region: String,
  fromUrl: String,
  timestamp: String,
  dimensions: [String],
  value: Number
});

module.exports = mongoose.model('Datapoint', datapointSchema);
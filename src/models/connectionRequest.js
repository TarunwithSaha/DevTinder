const mongoose = require("mongoose");

const STATUSES = ["ignored", "interested", "accepted", "rejected"];

const connectionRequestSchema = new mongoose.Schema(
  {
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      validate: {
        // A function (not an arrow) so "this" is the document being validated
        validator: function (v) {
          return !v.equals(this.fromUserId);
        },
        message: "You cannot send a request to yourself",
      },
    },
    status: {
      type: String,
      required: true,
      enum: { values: STATUSES, message: "{VALUE} is not a valid status" },
    },
  },
  { timestamps: true }
);

// The database itself refuses a second request from the same sender to the same
// receiver, even if two requests arrive at exactly the same moment.
connectionRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });

// Serves "show me the requests sent TO me with status X" (used in Part 3)
connectionRequestSchema.index({ toUserId: 1, status: 1 });

const ConnectionRequest = mongoose.model("ConnectionRequest", connectionRequestSchema);
ConnectionRequest.STATUSES = STATUSES;

module.exports = ConnectionRequest;
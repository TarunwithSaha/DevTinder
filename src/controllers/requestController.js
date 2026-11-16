const connectionService = require("../services/connectionService");

function summary(r) {
  return {
    id: r._id,
    fromUserId: r.fromUserId,
    toUserId: r.toUserId,
    status: r.status,
    createdAt: r.createdAt,
  };
}

exports.send = async (req, res) => {
  const { status, toUserId } = req.params;
  const request = await connectionService.sendRequest(req.user, status, toUserId);
  res.status(201).json({
    message: status === "interested" ? "Request sent" : "User skipped",
    request: summary(request),
  });
};

exports.review = async (req, res) => {
  const { status, requestId } = req.params;
  const request = await connectionService.reviewRequest(req.user, status, requestId);
  res.json({ message: `Request ${status}`, request: summary(request) });
};
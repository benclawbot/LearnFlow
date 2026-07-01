export default function handler(_request, response) {
  response.status(200).json({
    ok: true,
    app: 'LearnFlow',
    model: process.env.MINIMAX_MODEL || 'MiniMax-M3'
  });
}

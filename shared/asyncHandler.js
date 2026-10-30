// Express 4 tidak menangkap error dari handler async; bungkus agar diteruskan ke error middleware.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

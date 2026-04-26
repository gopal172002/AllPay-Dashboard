process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/allpay_test";
process.env.JWT_SECRET = "test_jwt_secret_for_jest";
process.env.S3_ENDPOINT = "http://127.0.0.1:4566";
process.env.S3_PUBLIC_BASE = "http://127.0.0.1:4566";

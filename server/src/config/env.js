import 'dotenv/config';
const required=['MONGODB_URI','CLIENT_URL','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET'];
for(const k of required){if(!process.env[k])throw new Error(`Missing environment variable: ${k}`)}
if(process.env.JWT_ACCESS_SECRET.length<32||process.env.JWT_REFRESH_SECRET.length<32)throw new Error('JWT secrets must contain at least 32 characters');
export const env={port:Number(process.env.PORT||5000),nodeEnv:process.env.NODE_ENV||'development',mongoUri:process.env.MONGODB_URI,clientUrl:process.env.CLIENT_URL,accessSecret:process.env.JWT_ACCESS_SECRET,refreshSecret:process.env.JWT_REFRESH_SECRET,accessExpires:process.env.JWT_ACCESS_EXPIRES_IN||'15m',refreshExpires:process.env.JWT_REFRESH_EXPIRES_IN||'7d',cookieSecure:String(process.env.COOKIE_SECURE)==='true',uploadDir:process.env.UPLOAD_DIR||'src/uploads',maxFileSizeMb:Number(process.env.MAX_FILE_SIZE_MB||10),resetMinutes:Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES||30)};

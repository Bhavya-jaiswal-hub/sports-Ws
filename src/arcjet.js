import arcjet, { detectBot, shield, slidingWindow } from "@arcjet/node";

const arcjetKey = process.env.ARCJET_KEY;
const arcjetEnv = (process.env.ARCJET_ENV || '').toLowerCase();
const arcjetMode = process.env.ARCJET_MODE === 'DRY_RUN' ? 'DRY_RUN' : 'LIVE';


if (!arcjetKey) {
     console.warn('ARCJET_KEY not set - Arcjet security disabled');
}


const httpRateLimit = Number(process.env.ARCJET_HTTP_RATE_LIMIT) || 100;
const httpRateInterval = process.env.ARCJET_HTTP_RATE_INTERVAL || '60s';


export const httpArcjet = arcjetKey
  ? arcjet({
    key: arcjetKey,
    rules: [
        shield({ mode: arcjetMode }),
        
        slidingWindow({ mode: arcjetMode, interval: httpRateInterval, max: httpRateLimit })
    ]
  })
  : null; 

  export const httpArcjetWithBot = httpArcjet
  ? httpArcjet.withRule(
      detectBot({ mode: arcjetMode, allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'] })
    )
  : null;


export const wsArcjet =  arcjetKey ? 
arcjet({
    key: arcjetKey,
    rules: [
        shield({ mode: arcjetMode}),
        detectBot({ mode:arcjetMode , allow: ['CATEGORY:SEARCH_ENGINE' , "CATEGORY:PREVIEW"]}),
        slidingWindow({mode: arcjetMode , interval: '2s' , max: 5 })
    ]
}) : null; 

export function getClientIp(req) {
    const candidate =
      req.ip ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;
    if (!candidate || candidate === "undefined" || candidate === "null" || candidate === "") {
      return null;
    }
    return candidate;
}

export function securityMiddleware() {
     return async (req,res ,next) => {
         if(!httpArcjet || arcjetEnv === 'development') return next();

         const ip = getClientIp(req);
         // Arcjet fingerprinting needs an IP; skip protection if Render/health checks omit it
         if(!ip) return next();
         // ensure Arcjet sees an IP without mutating req.ip (getter-only in some environments)
         if(!req.headers["x-forwarded-for"]) {
            req.headers["x-forwarded-for"] = ip;
         }

         try {
            const decision =  await httpArcjet.protect(req);

         if(decision.isDenied()) {
            if(decision.reason.isRateLimit()) {
                 return res.status(429).json({error:'Too many requests.'});
            } 

            return res.status(403).json({ error: 'Forbidden.'});
         }

         } catch (e) {
             if(String(e?.message || "").toLowerCase().includes('ip') || String(e).includes('ip')) {
               console.warn('Arcjet skipped (missing ip characteristic)');
               return next();
             }
             console.error('Arcjet middleware error' , e);
             return res.status(503).json({error: 'service unavailable'});
         } 

         next()
     }
}

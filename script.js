/* ========== TUNABLE PARAMETERS ========== */
const RPC_URL = 'https://rpc.soniclabs.com';
// const RPC_URL = 'http://localhost:3000'
const BLOCK_EXPLORER = 'https://sonicscan.org/tx';

// Queue system settings
const USE_QUEUE = true  // Toggle queue system on/off
const MAX_QUEUE_TIME = 5000  // Maximum queue time in milliseconds
const TARGET_SPAWN_RATE = 100  // Target spawns per second
const MIN_SPAWN_INTERVAL = 1000 / TARGET_SPAWN_RATE  // Minimum time between spawns

// Star colors based on transaction amounts
const STAR_COLORS = {
  ZERO: "rgba(255, 255, 255, $OPACITY)",  // white (0 S)
  SMALL: "rgba(255, 69, 69, $OPACITY)",   // red (0-1 S)
  MED: "rgba(211, 74, 216, $OPACITY)",    // purple (1-1000 S)
  LARGE: "rgba(95, 111, 227, $OPACITY)",  // blue (1000-100000 S)
  HUGE: "rgba(105, 212, 91, $OPACITY)"    // green (>100000 S)
};

// Animation parameters
const FOCAL_LENGTH = window.innerWidth * 3;  // Perspective effect
const MIN_Z = -100;                         // Allow spheres to pass through viewer
const MAX_Z = window.innerWidth * 4;        // Starting distance
const Z_SPEED_MIN = 2;                      // Base speed
const Z_SPEED_VARIANCE = 2;                 // Additional random speed
const MAX_SPHERES = 5000;                   // Maximum spheres to show at once
const MOTION_BLUR = true;                   // Enable motion blur effect
const MOTION_BLUR_ALPHA = 0.3;              // Higher alpha = less trail persistence
const DISTANT_STAR_BLUR = true;             // Enable blurring of distant spheres
const CENTER_BIAS = 0.8;                    // Bias toward center (0-1, higher = more centered)
const CULL_OFFSCREEN = true;                // Skip rendering spheres that are off-screen
const SIZE_CURVE_POWER = 1.5;               // Power for size calculation
const SPHERE_IMAGE_SIZE = 128;              // Size of pre-rendered sphere images

// Engine limits
const TPS_WINDOW = 10000;                   // Window for TPS calculation (ms)

// Setup canvas
const canvas = document.getElementById("space");
const ctx = canvas.getContext("2d");

// Set canvas size to window size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Initial background fill with dark blue color
ctx.fillStyle = "rgba(0, 10, 20, 1)";
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Center coordinates
let centerX = canvas.width / 2;
let centerY = canvas.height / 2;

// Animation state
let animate = true;
let isPaused = false;
let pausedSpheres = []; // Store spheres that arrive while paused
let frameCount = 0;     // Track frame count
let txQueue = [];       // Queue for transactions
let lastSpawnTime = 0;  // Track last spawn time for rate limiting

// Transaction tracking
let txTimes = [];
let volume = 0;

// Sphere collection
let spheres = [];
let hoveredSphere = null;

// Pre-rendered sphere images
let sphereImages = {};

/* ========== PRE-RENDERED IMAGES ========== */
// Initialize pre-rendered sphere images for improved performance
function initializeSphereImages() {
  // Create pre-rendered images for each sphere color
  sphereImages = {
    white: createSphereImage(STAR_COLORS.ZERO.replace('$OPACITY', '1')),
    red: createSphereImage(STAR_COLORS.SMALL.replace('$OPACITY', '1')),
    purple: createSphereImage(STAR_COLORS.MED.replace('$OPACITY', '1')),
    blue: createSphereImage(STAR_COLORS.LARGE.replace('$OPACITY', '1')),
    green: createSphereImage(STAR_COLORS.HUGE.replace('$OPACITY', '1'))
  };
  
  // Also create glow images for each color
  sphereImages.whiteGlow = createGlowImage(STAR_COLORS.ZERO.replace('$OPACITY', '1'));
  sphereImages.redGlow = createGlowImage(STAR_COLORS.SMALL.replace('$OPACITY', '1'));
  sphereImages.purpleGlow = createGlowImage(STAR_COLORS.MED.replace('$OPACITY', '1'));
  sphereImages.blueGlow = createGlowImage(STAR_COLORS.LARGE.replace('$OPACITY', '1'));
  sphereImages.greenGlow = createGlowImage(STAR_COLORS.HUGE.replace('$OPACITY', '1'));
  
  console.log("Pre-rendered sphere images initialized");
}

// Function to create a pre-rendered sphere image
function createSphereImage(baseColor) {
  // Create an offscreen canvas
  const img = document.createElement('canvas');
  img.width = SPHERE_IMAGE_SIZE;
  img.height = SPHERE_IMAGE_SIZE;
  const imgCtx = img.getContext('2d');
  
  // Calculate center and radius
  const center = SPHERE_IMAGE_SIZE / 2;
  const radius = center * 0.8;
  
  // Extract the base color components
  let baseColorNoOpacity = baseColor;
  if (baseColorNoOpacity.endsWith(')')) {
    baseColorNoOpacity = baseColorNoOpacity.substring(0, baseColorNoOpacity.length - 1);
  }
  
  // Light source offset
  const lightOffsetX = -radius * 0.3;
  const lightOffsetY = -radius * 0.3;
  
  // Create the sphere gradient
  const sphereGradient = imgCtx.createRadialGradient(
    center + lightOffsetX, center + lightOffsetY, 0,
    center, center, radius
  );
  
  // Create a highlight color (lighter version of base color)
  const highlightColor = baseColorNoOpacity + '1)';
  
  // Create a mid color (brighter)
  const midColor = baseColorNoOpacity + '1)';  // Full opacity
  
  // Apply the highlight-to-mid gradient
  sphereGradient.addColorStop(0, highlightColor);
  sphereGradient.addColorStop(1, midColor);
  
  // Draw the base sphere
  imgCtx.fillStyle = sphereGradient;
  imgCtx.beginPath();
  imgCtx.arc(center, center, radius, 0, Math.PI * 2);
  imgCtx.fill();
  
  // Add specular highlight
  const specularSize = radius * 0.5;
  const specularGradient = imgCtx.createRadialGradient(
    center + lightOffsetX * 1.5, center + lightOffsetY * 1.5, 0,
    center + lightOffsetX * 1.5, center + lightOffsetY * 1.5, specularSize
  );
  
  specularGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  specularGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  imgCtx.fillStyle = specularGradient;
  imgCtx.beginPath();
  imgCtx.arc(center + lightOffsetX * 1.5, center + lightOffsetY * 1.5, specularSize, 0, Math.PI * 2);
  imgCtx.fill();
  
  return img;
}

// Function to create a pre-rendered glow image
function createGlowImage(baseColor) {
  // Create an offscreen canvas (larger for the glow effect)
  const img = document.createElement('canvas');
  img.width = SPHERE_IMAGE_SIZE * 2; // Larger for glow
  img.height = SPHERE_IMAGE_SIZE * 2;
  const imgCtx = img.getContext('2d');
  
  // Calculate center and radius
  const center = SPHERE_IMAGE_SIZE;
  const innerRadius = center * 0.3;
  const outerRadius = center * 0.9;
  
  // Extract the base color components
  let baseColorNoOpacity = baseColor;
  if (baseColorNoOpacity.endsWith(')')) {
    baseColorNoOpacity = baseColorNoOpacity.substring(0, baseColorNoOpacity.length - 1);
  }
  
  // Create the glow gradient
  const glowGradient = imgCtx.createRadialGradient(
    center, center, innerRadius,
    center, center, outerRadius
  );
  
  glowGradient.addColorStop(0, baseColorNoOpacity + '0.9)');
  glowGradient.addColorStop(1, baseColorNoOpacity + '0)');
  
  // Draw the glow
  imgCtx.fillStyle = glowGradient;
  imgCtx.beginPath();
  imgCtx.arc(center, center, outerRadius, 0, Math.PI * 2);
  imgCtx.fill();
  
  return img;
}

/* ========== SPHERE HANDLING ========== */
// Get color based on transaction amount
function colorForAmount(amount, opacity) {
  let colorTemplate;
  if (amount === 0) {
    colorTemplate = STAR_COLORS.ZERO;
  } else if (amount < 1) {
    colorTemplate = STAR_COLORS.SMALL;
  } else if (amount <= 1000) {
    colorTemplate = STAR_COLORS.MED;
  } else if (amount <= 100000) {
    colorTemplate = STAR_COLORS.LARGE;
  } else {
    colorTemplate = STAR_COLORS.HUGE;
  }
  return colorTemplate.replace('$OPACITY', opacity);
}

// Get color type string based on amount
function getColorType(amount) {
  if (amount === 0) return 'white';
  if (amount < 1) return 'red';
  if (amount <= 1000) return 'purple';
  if (amount <= 100000) return 'blue';
  return 'green';
}

// Helper to get base color for a color type
function getBaseColorForType(colorType) {
  switch(colorType) {
    case 'white': return "rgba(255, 255, 255, 1)".replace('1', '');
    case 'red': return "rgba(255, 69, 69, 1)".replace('1', '');
    case 'purple': return "rgba(211, 74, 216, 1)".replace('1', '');
    case 'blue': return "rgba(95, 111, 227, 1)".replace('1', '');
    case 'green': return "rgba(105, 212, 91, 1)".replace('1', '');
    default: return "rgba(255, 255, 255, 1)".replace('1', '');
  }
}

// Reuse sphere objects from a pool for better performance
const spherePool = [];

// Create a new sphere from transaction data
function createSphere(hash, amount, sender) {
  // If paused, add to queue instead of showing immediately
  if (isPaused) {
    pausedSpheres.push({hash, amount, sender});
    return;
  }
  
  // Biased random offset - more likely to be closer to center
  const spreadFactor = 0.8; // % of the screen width/height
  let offsetX, offsetY;
  
  // Use CENTER_BIAS to make spheres more likely to spawn toward center
  if (Math.random() < CENTER_BIAS) {
    // Central zone spawning (within 30% of center)
    offsetX = (Math.random() - 0.5) * canvas.width * 0.3;
    offsetY = (Math.random() - 0.5) * canvas.height * 0.3;
  } else {
    // Wider spawning
    offsetX = (Math.random() - 0.5) * canvas.width * spreadFactor;
    offsetY = (Math.random() - 0.5) * canvas.height * spreadFactor;
  }
  
  // Get a sphere from the pool or create a new one
  let sphere;
  if (spherePool.length > 0) {
    sphere = spherePool.pop();
    // Reset/update properties
    sphere.originalX = centerX + offsetX;
    sphere.originalY = centerY + offsetY;
    sphere.z = MAX_Z * (0.9 + Math.random() * 0.1);
    sphere.zSpeed = Z_SPEED_MIN + Math.random() * Z_SPEED_VARIANCE;
    sphere.txHash = hash;
    sphere.amount = amount;
    sphere.sender = sender;
    sphere.opacity = 0.6; // Start with 60% opacity
    sphere.rotation = Math.random() * Math.PI * 2;
    sphere.rotationSpeed = (Math.random() - 0.5) * 0.01;
    sphere.currentTrail = [];
    sphere.age = 0; // Track age for fade-in effect
    sphere.targetOpacity = 1; // Higher maximum opacity
    sphere.colorType = getColorType(amount);
  } else {
    // Create new sphere
    sphere = {
      originalX: centerX + offsetX,
      originalY: centerY + offsetY,
      z: MAX_Z * (0.9 + Math.random() * 0.1),  // Start far away
      zSpeed: Z_SPEED_MIN + Math.random() * Z_SPEED_VARIANCE,
      txHash: hash,
      amount: amount,
      sender: sender,
      opacity: 0.6, // Start with 60% opacity
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.01,
      currentTrail: [],
      age: 0,
      targetOpacity: 1, // Higher maximum opacity
      colorType: getColorType(amount)
    };
  }
  
  // If we have too many spheres, remove the oldest one and add it to the pool
  if (spheres.length >= MAX_SPHERES) {
    const oldSphere = spheres.shift();
    spherePool.push(oldSphere);
  }
  
  spheres.push(sphere);
}

// Process any queued spheres when unpausing
function processQueuedSpheres() {
  if (pausedSpheres.length > 0) {
    // Limit how many we process at once to avoid stuttering
    const processCount = Math.min(pausedSpheres.length, 50);
    
    for (let i = 0; i < processCount; i++) {
      const tx = pausedSpheres.shift();
      createSphere(tx.hash, tx.amount, tx.sender);
    }
    
    // If we still have more, schedule them for the next frame
    if (pausedSpheres.length > 0) {
      setTimeout(processQueuedSpheres, 100);
    }
  }
}

/* ========== ANIMATION FUNCTIONS ========== */
function moveSpheres() {
  if (isPaused) return;
  
  const tps = calcTPS();
  
  // Cap the TPS for speed calculation purposes
  const cappedTPS = Math.min(tps, 200); // Cap at 200 TPS for visual purposes
  
  // Display the actual TPS but use capped TPS for speed calculations
  const speedMult = Math.max(1, 0.08 * Math.pow(cappedTPS, 0.69897)) * 1.5;
  
  // Add debug counter to track how many spheres reach MIN_Z
  let removedSpheres = 0;
  
  for (let i = spheres.length - 1; i >= 0; i--) {
    const sphere = spheres[i];
    
    // Increase age for fade-in effect
    sphere.age++;
    
    // Calculate distance from center
    const z = Math.max(sphere.z, 5);
    const scale = FOCAL_LENGTH / z;
    const currentX = (sphere.originalX - centerX) * scale + centerX;
    const currentY = (sphere.originalY - centerY) * scale + centerY;
    const distanceFromCenter = Math.sqrt(
      Math.pow(currentX - centerX, 2) + 
      Math.pow(currentY - centerY, 2)
    );
    
    // Calculate max distance (half of screen width/height)
    const maxDistance = Math.max(canvas.width, canvas.height) / 2;
    
    // Calculate distance factor (0 at center, 1 at edge)
    const distanceFactor = Math.min(1, distanceFromCenter / maxDistance);
    
    // Fade in opacity smoothly, with higher opacity near edges
    // Reach max opacity sooner (at 70% of max distance instead of 100%)
    const targetOpacity = sphere.targetOpacity * (0.6 + 0.4 * Math.min(1, distanceFactor * 1.4));
    if (sphere.opacity < targetOpacity) {
      sphere.opacity = Math.min(
        targetOpacity, 
        sphere.opacity + (targetOpacity - 0.6) / 15  // Faster fade-in
      ); 
    }
    
    // Clear last frame's trail
    sphere.currentTrail = [];
    
    // Store current position for this frame's trail
    if (sphere.z < MAX_Z * 0.5) {
      sphere.currentTrail.push({x: currentX, y: currentY, z: sphere.z});
    }
    
    // Control the speed of very close spheres to prevent them from "jumping" past MIN_Z
    let effectiveSpeed = sphere.zSpeed * speedMult;
    if (sphere.z < 50) {
      // Slow down spheres as they get very close to reduce "jumps"
      effectiveSpeed = Math.min(effectiveSpeed, 10);
    }
    
    // Move toward viewer (z decreases)
    sphere.z -= effectiveSpeed;
    
    // Update rotation
    sphere.rotation += sphere.rotationSpeed;
    
    // If sphere is too far behind viewer, remove it
    if (sphere.z <= MIN_Z) {
      spheres.splice(i, 1);
      // Return to pool for reuse
      spherePool.push(sphere);
      removedSpheres++;
    }
  }
  
  // Log removal info if any spheres were removed
  /**
    if (removedSpheres > 0 && spheres.length < 50) {
      console.log(`Removed ${removedSpheres} spheres at z <= ${MIN_Z}, ${spheres.length} remaining`);
    }
  */
}

// Performance-optimized drawing function with batching
function drawSpheres() {
  frameCount++;
  
  // Clear the canvas with slight transparency for motion blur effect
  ctx.fillStyle = MOTION_BLUR ? 
    `rgba(0, 10, 20, ${MOTION_BLUR_ALPHA})` : 
    "rgba(0, 10, 20, 1)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Every 100 frames, do a complete clear to prevent permanent trails
  if (frameCount % 100 === 0) {
    ctx.fillStyle = "rgba(0, 10, 20, 1)";  // Fully opaque
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  // Calculate visible area with MUCH larger margins
  const viewLeft = -canvas.width/2;  // Greatly increased left margin
  const viewRight = canvas.width * 1.5; // Greatly increased right margin
  const viewTop = -canvas.height/2;  // Greatly increased top margin
  const viewBottom = canvas.height * 2; // Very large bottom margin
  
  // Sort spheres by z-depth (farther objects drawn first)
  // Only sort if we have a significant number of spheres
  if (spheres.length > 50) {
    spheres.sort((a, b) => b.z - a.z);
  }
  
  // Batch spheres by color and distance zone for more efficient rendering
  const batches = {
    // Distant spheres (simplified rendering)
    far: {
      white: [], red: [], purple: [], blue: [], green: []
    },
    // Mid-range spheres (moderate detail)
    mid: {
      white: [], red: [], purple: [], blue: [], green: []
    },
    // Close spheres (full detail)
    close: {
      white: [], red: [], purple: [], blue: [], green: []
    }
  };
  
  // Counter for rendered spheres
  let visibleSphereCount = 0;
  
  // Pre-calculate sphere data and organize into batches
  for (let i = 0; i < spheres.length; i++) {
    const sphere = spheres[i];
    
    // Calculate perspective projection for current position
    // Prevent division by very small numbers
    const z = Math.max(sphere.z, 5);
    const scale = FOCAL_LENGTH / z;
    let pixelX = (sphere.originalX - centerX) * scale + centerX;
    let pixelY = (sphere.originalY - centerY) * scale + centerY;
    
    // CRITICAL: Never cull close spheres, regardless of position
    // Only cull if the sphere is not close AND outside the expanded view area
    const shouldCull = CULL_OFFSCREEN && 
                      sphere.z > MAX_Z * 0.15 && // Never cull close spheres (< 15% of max distance)
                      (pixelX < viewLeft || pixelX > viewRight || 
                       pixelY < viewTop || pixelY > viewBottom);
                   
    if (shouldCull) {
      continue;
    }
    
    // Count visible spheres
    visibleSphereCount++;
    
    // Apply a maximum limit to avoid performance issues on less powerful devices
    // But prioritize closer spheres and never cull very close ones
    if (visibleSphereCount > 1000) {
      if (sphere.z > MAX_Z * 0.3) {
        continue;
      }
    }
    
    // Calculate normalized distance factor (0 when close, 1 when far)
    const distanceFactor = Math.min(1, Math.max(0, sphere.z / MAX_Z));
    
    // Calculate size 
    let baseSize;
    switch(sphere.colorType) {
      case 'white': baseSize = 2; break;
      case 'red': baseSize = 4; break;
      case 'purple': baseSize = 6; break;
      case 'blue': baseSize = 7; break;
      case 'green': baseSize = 8; break;
      default: baseSize = 1;
    }
    // Apply distance scaling - start at 30% and scale up to 100%
    baseSize = baseSize * (0.3 + 0.7 * Math.pow(1 - distanceFactor, SIZE_CURVE_POWER));
    baseSize = Math.max(0.5, baseSize);
    
    // Store projected coordinates for hit testing
    sphere.screenX = pixelX;
    sphere.screenY = pixelY;
    sphere.radius = baseSize;
    
    // Determine which batch this sphere belongs to
    let distanceBatch;
    if (distanceFactor > 0.7) {
      distanceBatch = 'far';
    } else if (distanceFactor > 0.3) {
      distanceBatch = 'mid';
    } else {
      distanceBatch = 'close';
    }
    
    // Add to appropriate batch with rendering data
    batches[distanceBatch][sphere.colorType].push({
      x: pixelX,
      y: pixelY,
      size: baseSize,
      distanceFactor: distanceFactor,
      opacity: sphere.opacity * (0.4 + 0.6 * Math.pow(1 - distanceFactor, 0.5)),
      rotation: sphere.rotation,
      sphere: sphere
    });
  }
  
  // Process batches in order (far to close)
  // 1. Render far spheres (minimal detail - just circles)
  Object.entries(batches.far).forEach(([color, sphereData]) => {
    if (sphereData.length === 0) return;
    
    sphereData.forEach(data => {
      // For distant spheres, use simplified rendering
      drawSimpleSphere(data.x, data.y, data.size, color, data.opacity * 0.7, data.distanceFactor);
    });
  });
  
  // 2. Render mid-range spheres (moderate detail)
  Object.entries(batches.mid).forEach(([color, sphereData]) => {
    if (sphereData.length === 0) return;
    
    sphereData.forEach(data => {
      // For mid-range, use medium detail spheres
      drawMediumSphere(data.x, data.y, data.size, color, data.opacity, data.distanceFactor);
    });
  });
  
  // 3. Render close spheres (full detail) and trails
  Object.entries(batches.close).forEach(([color, sphereData]) => {
    if (sphereData.length === 0) return;
    
    // Render trails first
    sphereData.forEach(data => {
      const sphere = data.sphere;
      
      // Draw trail if exists
      if (sphere.currentTrail.length > 0) {
        const trailOpacity = sphere.opacity * 0.3 * (1 - data.distanceFactor);
        const trailSize = data.size * 0.5;
        
        // Calculate color with trail opacity
        ctx.fillStyle = colorForAmount(sphere.amount, trailOpacity);
        
        // Draw small dots for current frame's trail
        for (let t = 0; t < sphere.currentTrail.length; t++) {
          const trailPos = sphere.currentTrail[t];
          ctx.fillRect(trailPos.x, trailPos.y, trailSize, trailSize);
        }
      }
      
      // Draw full detail sphere
      drawSphere(data.x, data.y, data.size, color, data.opacity, data.rotation, data.distanceFactor);
    });
  });
}

// Function to draw a 3D sphere with optimized image rendering
function drawSphere(x, y, size, colorType, opacity, rotation, distanceFactor) {
  // Calculate distance from center
  const distanceFromCenter = Math.sqrt(
    Math.pow(x - centerX, 2) + 
    Math.pow(y - centerY, 2)
  );
  const maxDistance = Math.max(canvas.width, canvas.height) / 2;
  const edgeFactor = Math.min(1, distanceFromCenter / maxDistance);
  
  // Higher opacity near edges
  const finalOpacity = Math.min(1, opacity * (0.5 + 0.5 * edgeFactor));
  
  ctx.globalAlpha = finalOpacity;
  const sphereImage = sphereImages[colorType];
  const scaledSize = size * 2.4; // Adjust as needed for visual match
  ctx.drawImage(
    sphereImage,
    x - scaledSize / 2,
    y - scaledSize / 2,
    scaledSize,
    scaledSize
  );
  
  // Reset global alpha
  ctx.globalAlpha = 1.0;
}

// Medium detail sphere (optimized)
function drawMediumSphere(x, y, size, colorType, opacity, distanceFactor) {
  // Calculate distance from center
  const distanceFromCenter = Math.sqrt(
    Math.pow(x - centerX, 2) + 
    Math.pow(y - centerY, 2)
  );
  const maxDistance = Math.max(canvas.width, canvas.height) / 2;
  const edgeFactor = Math.min(1, distanceFromCenter / maxDistance);
  
  // Higher opacity near edges
  const finalOpacity = Math.min(0.8, opacity * (0.4 + 0.6 * edgeFactor));
  
  ctx.globalAlpha = finalOpacity;
  const sphereImage = sphereImages[colorType];
  const scaledSize = size * 2; // Slightly smaller for mid-range
  ctx.drawImage(
    sphereImage,
    x - scaledSize / 2,
    y - scaledSize / 2,
    scaledSize,
    scaledSize
  );
  
  // Reset global alpha
  ctx.globalAlpha = 1.0;
}

// Simplified sphere drawing for distant spheres (optimized)
function drawSimpleSphere(x, y, size, colorType, opacity, distanceFactor) {
  // Calculate distance from center
  const distanceFromCenter = Math.sqrt(
    Math.pow(x - centerX, 2) + 
    Math.pow(y - centerY, 2)
  );
  const maxDistance = Math.max(canvas.width, canvas.height) / 2;
  const edgeFactor = Math.min(1, distanceFromCenter / maxDistance);
  
  // Higher opacity near edges
  const finalOpacity = Math.min(0.6, opacity * (0.3 + 0.7 * edgeFactor));
  
  ctx.globalAlpha = finalOpacity;
  const sphereImage = sphereImages[colorType];
  const scaledSize = size * 1.2; // Very small for distant spheres
  ctx.drawImage(
    sphereImage,
    x - scaledSize / 2,
    y - scaledSize / 2,
    scaledSize,
    scaledSize
  );
  
  // Reset global alpha
  ctx.globalAlpha = 1.0;
}

/* ========== QUEUE PROCESSING ========== */
function processQueue() {
  const now = Date.now()
  const queueLength = txQueue.length

  // Calculate how many transactions we should process this frame
  let spawnCount = 1
  if (queueLength > 0) {
    // If queue is getting too long, increase spawn rate
    const queueTime = queueLength * MIN_SPAWN_INTERVAL
    if (queueTime > MAX_QUEUE_TIME) {
      // Calculate how many we need to spawn to maintain 5s queue
      spawnCount = Math.ceil(queueTime / MAX_QUEUE_TIME)
    }
  }

  // Spawn the calculated number of transactions
  for (let i = 0; i < spawnCount && txQueue.length > 0; i++) {
    const tx = txQueue.shift()
    createSphere(tx.hash, tx.amount, tx.sender)
    volume += tx.amount
    txTimes.push(now)
  }

  lastSpawnTime = now
}

/* ========== POLLING ========== */
const poll = async () => {
  if (!animate) return;

  const transactions = await getLatestBlocksAndTransactions();
  if (transactions) {
    if (USE_QUEUE) {
      // Add transactions to queue
      txQueue.push(...transactions)
    } else {
      // Spawn immediately (old behavior)
      for (const tx of transactions) {
        createSphere(tx.hash, tx.amount, tx.sender);
        volume += tx.amount;
        txTimes.push(Date.now());
      }
    }
  }

  // Fixed polling interval of 600ms is appropriate since blocks come every ~2 seconds
  setTimeout(poll, 600);
}

/* ========== ANIMATION LOOP ========== */
function executeFrame() {
  if (!animate) return;
  
  // Process queue if enabled and not paused
  if (USE_QUEUE && !isPaused) {
    processQueue()
  }

  // Clear the canvas
  ctx.fillStyle = "rgba(0, 10, 20, 1)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Update and draw spheres
  if (!isPaused) {
    moveSpheres();
  }
  drawSpheres();

  // Update stats
  document.getElementById('tps').setAttribute('data-value', Math.round(calcTPS()));
  document.getElementById('volume').setAttribute('data-value', `${Math.round(volume).toLocaleString('en-US')} S`);

  // Increment frame counter
  frameCount++;

  // Schedule next frame
  requestAnimationFrame(executeFrame);
}

/* ========== BLOCKCHAIN API ========== */
let pendingRequest = null;
const processedBlockHashes = new Set();

const fetchRPC = async (method, params = []) => {
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    return data.result;
  } catch (error) {
    console.error("RPC call failed:", error);
    return null;
  }
};

const getLatestBlocksAndTransactions = async () => {
  if (pendingRequest) {
    return null;
  }
  
  try {
    pendingRequest = true;
    
    // First get block number
    const latest = parseInt(await fetchRPC('eth_blockNumber'), 16);
    if (!latest) return null;
    
    // Always fetch 4 blocks to ensure we don't miss any
    // This is enough since blocks come every ~2 seconds
    const batch = [];
    for (let i = 0; i < 4; i++) {
      batch.push({
        jsonrpc: '2.0',
        id: i,
        method: 'eth_getBlockByNumber',
        params: [`0x${(latest - i).toString(16)}`, true]
      });
    }

    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const arr = await res.json();
    const newTransactions = [];
    let lastProcessedBlock = latest;

    for (const r of arr) {
      const blk = r.result;
      if (!blk || processedBlockHashes.has(blk.hash)) continue;

      const blockNumber = parseInt(blk.number, 16);
      // Ensure we process blocks in order
      if (blockNumber > lastProcessedBlock) continue;
      lastProcessedBlock = blockNumber;

      processedBlockHashes.add(blk.hash);
      if (processedBlockHashes.size > 50) { 
        const oldestHash = processedBlockHashes.values().next().value;
        processedBlockHashes.delete(oldestHash);
      }

      for (const tx of blk.transactions || []) {
        const amt = parseInt(tx.value, 16) / 1e18;
        newTransactions.push({
          hash: tx.hash,
          amount: amt,
          sender: tx.from,
          blockHash: blk.hash,
          blockNumber: blockNumber
        });
      }
    }

    return newTransactions.length > 0 ? newTransactions : null;

  } catch (e) {
    console.error('Error fetching blockchain data:', e);
    return null;
  } finally {
    pendingRequest = null;
  }
};

function calcTPS() {
  const now = Date.now();
  txTimes = txTimes.filter(t => now - t < TPS_WINDOW);
  return txTimes.length / (TPS_WINDOW / 1000);
}

/* ========== INTERACTION ========== */
// Handle mousemove for hover tooltip
document.addEventListener('mousemove', (e) => {
  // Check if panel is open
  const panel = document.getElementById('panel');
  if (panel.classList.contains('show')) {
    // Hide tooltip and reset hover state when panel is open
    hoveredSphere = null;
    document.getElementById('tooltip').style.display = 'none';
    return;
  }

  const mouseX = e.clientX;
  const mouseY = e.clientY;
  
  // Reset hovered sphere
  hoveredSphere = null;
  
  // Find if mouse is over any sphere (check in reverse to prioritize front spheres)
  for (let i = spheres.length - 1; i >= 0; i--) {
    const sphere = spheres[i];
    
    // Simple hit test - check if mouse is close enough to the sphere
    const distance = Math.sqrt(
      Math.pow(mouseX - sphere.screenX, 2) +
      Math.pow(mouseY - sphere.screenY, 2)
    );
    
    if (distance < Math.max(15, sphere.radius * 3)) {
      hoveredSphere = sphere;
      break;
    }
  }
  
  // Update cursor style based on hover state
  canvas.style.cursor = hoveredSphere ? 'pointer' : 'default';
  
  // Update tooltip
  const tooltip = document.getElementById('tooltip');
  
  if (hoveredSphere) {
    tooltip.textContent = `Amount: ${hoveredSphere.amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} S\nFrom: ${hoveredSphere.sender.slice(0, 6)}...${hoveredSphere.sender.slice(-4)}`;
    tooltip.style.display = 'block';
    tooltip.style.left = (mouseX - tooltip.offsetWidth/2) + 'px';
    tooltip.style.top = (mouseY - tooltip.offsetHeight - 10) + 'px';
  } else {
    tooltip.style.display = 'none';
  }
});

// Handle click to open transaction in block explorer
document.addEventListener('click', (e) => {
  // Check if panel is open
  const panel = document.getElementById('panel');
  if (panel.classList.contains('show')) {
    return; // Don't handle sphere clicks when panel is open
  }
  
  if (hoveredSphere) {
    e.preventDefault();
    e.stopPropagation();
    window.open(`${BLOCK_EXPLORER}/${hoveredSphere.txHash}`, '_blank');
  }
});

/* ========== PANEL ========== */
const aboutBtn = document.getElementById('about');
const panel = document.getElementById('panel');
const closeBtn = document.getElementById('close-button');

aboutBtn.onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  panel.classList.add('show');
};

closeBtn.onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  panel.classList.remove('show');
};

/* ========== PAUSE BUTTON ========== */
// Create pause button
const pauseBtn = document.createElement('button');
pauseBtn.id = 'pause-button';
pauseBtn.textContent = '⏸️';
pauseBtn.title = 'Pause/Resume';
document.body.appendChild(pauseBtn);

// Toggle pause state
pauseBtn.onclick = () => {
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? '▶️' : '⏸️';
  
  // If pausing, redraw once without trails for a clean look
  if (isPaused) {
    // Clear the canvas completely
    ctx.fillStyle = "rgba(0, 10, 20, 1)"; // Fully opaque
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Then redraw all spheres without trails
    drawSpheresWithoutTrails();
  }
  
  // If resuming, process any queued transactions
  if (!isPaused && pausedSpheres.length > 0) {
    processQueuedSpheres();
  }
};

// Function to draw all spheres but without any trails (for pause state)
function drawSpheresWithoutTrails() {
  // Sort spheres by z-depth (farther objects drawn first)
  if (spheres.length > 50) {
    spheres.sort((a, b) => b.z - a.z);
  }
  
  // Batch spheres by color and distance zone for more efficient rendering
  const batches = {
    far: { white: [], red: [], purple: [], blue: [], green: [] },
    mid: { white: [], red: [], purple: [], blue: [], green: [] },
    close: { white: [], red: [], purple: [], blue: [], green: [] }
  };
  
  // Calculate visible area with MUCH larger margins
  const viewLeft = -canvas.width/2;  
  const viewRight = canvas.width * 1.5; 
  const viewTop = -canvas.height/2;  
  const viewBottom = canvas.height * 2;
  
  // Pre-calculate sphere data and organize into batches
  for (let i = 0; i < spheres.length; i++) {
    const sphere = spheres[i];
    
    // Calculate perspective projection
    const z = Math.max(sphere.z, 5);
    const scale = FOCAL_LENGTH / z;
    let pixelX = (sphere.originalX - centerX) * scale + centerX;
    let pixelY = (sphere.originalY - centerY) * scale + centerY;
    
    // Skip if offscreen and not close
    const shouldCull = CULL_OFFSCREEN && 
                      sphere.z > MAX_Z * 0.15 &&
                      (pixelX < viewLeft || pixelX > viewRight || 
                       pixelY < viewTop || pixelY > viewBottom);
                   
    if (shouldCull) {
      continue;
    }
    
    // Calculate normalized distance factor
    const distanceFactor = Math.min(1, Math.max(0, sphere.z / MAX_Z));
    
    // Calculate size
    let baseSize;
    switch(sphere.colorType) {
      case 'white': baseSize = 2; break;
      case 'red': baseSize = 4; break;
      case 'purple': baseSize = 6; break;
      case 'blue': baseSize = 8; break;
      case 'green': baseSize = 10; break;
      default: baseSize = 4;
    }
    // Apply distance scaling
    baseSize = baseSize * Math.pow(1 - distanceFactor, SIZE_CURVE_POWER);
    baseSize = Math.max(0.5, baseSize);
    
    // Store projected coordinates
    sphere.screenX = pixelX;
    sphere.screenY = pixelY;
    sphere.radius = baseSize;
    
    // Determine which batch this sphere belongs to
    let distanceBatch = 'close';
    if (distanceFactor > 0.7) {
      distanceBatch = 'far';
    } else if (distanceFactor > 0.3) {
      distanceBatch = 'mid';
    }
    
    // Add to batch
    batches[distanceBatch][sphere.colorType].push({
      x: pixelX,
      y: pixelY,
      size: baseSize,
      distanceFactor: distanceFactor,
      opacity: sphere.opacity * (0.4 + 0.6 * Math.pow(1 - distanceFactor, 0.5)),
      rotation: sphere.rotation,
      sphere: sphere
    });
  }
  
  // Process batches in order (far to close) and draw spheres without trails
  Object.entries(batches.far).forEach(([color, sphereData]) => {
    if (sphereData.length === 0) return;
    
    sphereData.forEach(data => {
      drawSimpleSphere(data.x, data.y, data.size, color, data.opacity * 0.7, data.distanceFactor);
    });
  });
  
  Object.entries(batches.mid).forEach(([color, sphereData]) => {
    if (sphereData.length === 0) return;
    
    sphereData.forEach(data => {
      drawMediumSphere(data.x, data.y, data.size, color, data.opacity, data.distanceFactor);
    });
  });
  
  Object.entries(batches.close).forEach(([color, sphereData]) => {
    if (sphereData.length === 0) return;
    
    sphereData.forEach(data => {
      // Draw sphere WITHOUT trails
      drawSphere(data.x, data.y, data.size, color, data.opacity, data.rotation, data.distanceFactor);
    });
  });
}

/* ========== WINDOW RESIZING ========== */
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  centerX = canvas.width / 2;
  centerY = canvas.height / 2;
});

// Initialize pre-rendered images
initializeSphereImages();

// Start polling for transactions
poll();

// Start animation loop
executeFrame();

// Add pause button functionality
document.getElementById('pause').addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    isPaused = !isPaused;
    
    // Toggle icons
    const pauseIcon = this.querySelector('.pause-icon');
    const playIcon = this.querySelector('.play-icon');
    
    if (isPaused) {
        pauseIcon.style.display = 'none';
        playIcon.style.display = 'block';
        // Clear the canvas completely
        ctx.fillStyle = "rgba(0, 10, 20, 1)"; // Fully opaque
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Then redraw all spheres without trails
        drawSpheresWithoutTrails();
    } else {
        pauseIcon.style.display = 'block';
        playIcon.style.display = 'none';
        // Process any spheres that arrived while paused
        processQueuedSpheres();
    }
});
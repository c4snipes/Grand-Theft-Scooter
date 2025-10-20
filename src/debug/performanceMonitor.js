// --> Performance Monitor: Track memory usage and physics consistency
export class PerformanceMonitor {
  constructor() {
    this.startTime = performance.now();
    this.memorySnapshots = [];
    this.physicsMetrics = {
      collisionCount: 0,
      avgFrameTime: 0,
      memoryLeaks: 0
    };
    this.isMonitoring = false;
  }

  startMonitoring() {
    this.isMonitoring = true;
    this.takeMemorySnapshot('start');
    console.log('🔍 Performance monitoring started');
  }

  takeMemorySnapshot(label) {
    if (!this.isMonitoring) return;
    
    const memory = performance.memory ? {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
      limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
    } : { used: 'N/A', total: 'N/A', limit: 'N/A' };

    this.memorySnapshots.push({
      label,
      timestamp: performance.now() - this.startTime,
      memory
    });

    console.log(`📊 Memory [${label}]: ${memory.used}MB used / ${memory.total}MB total`);
  }

  recordCollision(targetType, physicsResponse) {
    if (!this.isMonitoring) return;
    
    this.physicsMetrics.collisionCount++;
    
    // Check for consistent physics behavior
    const expectedDamping = this.getExpectedDamping(targetType);
    const actualDamping = {
      angular: physicsResponse.angularDamping,
      linear: physicsResponse.linearDamping
    };
    
    const isConsistent = Math.abs(expectedDamping.angular - actualDamping.angular) < 0.01 &&
                        Math.abs(expectedDamping.linear - actualDamping.linear) < 0.01;
    
    if (!isConsistent) {
      this.physicsMetrics.memoryLeaks++;
      console.warn(`⚠️ Physics inconsistency detected for ${targetType}`);
    }
  }

  getExpectedDamping(targetType) {
    // Expected damping values based on our standardized system
    const dampingMap = {
      'Mall Kiosk': { angular: 0.9, linear: 0.75 },
      'Vending Machine': { angular: 0.9, linear: 0.75 },
      'ATM': { angular: 0.9, linear: 0.75 },
      'Shopping Cart': { angular: 0.9, linear: 0.75 },
      'Trash Can': { angular: 0.9, linear: 0.75 },
      'Bench': { angular: 0.7, linear: 0.5 },
      'Poster Stand': { angular: 0.7, linear: 0.5 },
      'Mall Patron': { angular: 0.8, linear: 0.6 },
      'Security Guard': { angular: 0.8, linear: 0.6 }
    };
    
    return dampingMap[targetType] || { angular: 0.6, linear: 0.4 };
  }

  generateReport() {
    if (!this.isMonitoring) return;
    
    this.takeMemorySnapshot('end');
    
    const startMemory = this.memorySnapshots[0]?.memory.used || 0;
    const endMemory = this.memorySnapshots[this.memorySnapshots.length - 1]?.memory.used || 0;
    const memoryGrowth = endMemory - startMemory;
    
    const report = {
      duration: Math.round(performance.now() - this.startTime),
      memoryGrowth: memoryGrowth,
      memoryLeakSuspected: memoryGrowth > 50, // More than 50MB growth is suspicious
      collisionCount: this.physicsMetrics.collisionCount,
      physicsConsistency: this.physicsMetrics.memoryLeaks === 0,
      snapshots: this.memorySnapshots
    };

    console.log('📈 Performance Report:', report);
    return report;
  }

  // REMOVED: Demo functions - keeping only essential monitoring functionality
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Auto-start monitoring in development
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  performanceMonitor.startMonitoring();
}

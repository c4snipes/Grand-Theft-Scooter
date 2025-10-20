// --> Enhanced Scoring System: Combos, multipliers, and advanced scoring mechanics
import { audioManager } from '../core/audio.js';

export class ScoringSystem {
  constructor(options = {}) {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastHitTime = 0;
    this.comboTimeWindow = options.comboTimeWindow || 2500; // Configurable combo window (increased from 2s to 2.5s)
    this.speedBonusThreshold = 8; // Minimum speed for speed bonus
    this.multiplierLevels = options.multiplierLevels || [1, 1.15, 1.35, 1.6, 1.9, 2.2]; // Balanced combo multipliers
    this.totalHits = 0;
    this.consecutiveHits = 0;
    this.lastHitType = null;
    this.maxScorePerHit = options.maxScorePerHit || 15000; // Score cap to prevent inflation
    
    // Point values for different target types
    this.basePoints = {
      // Props (destructible objects)
      'Planter': 40,
      'Bench': 55,
      'Mall Kiosk': 120,
      'Trash Can': 35,
      'Poster Stand': 30,
      'Box Stack': 25,
      'Food Cart': 80,
      'Vending Machine': 90,
      'Shopping Cart': 45,
      'Display Stand': 60,
      'Flower Pot': 35,
      'Newspaper Stand': 40,
      'ATM': 150,
      'Phone Booth': 100,
      
      // Humans (high value targets)
      'Mall Patron': 1600,
      'Security Guard': 2000,
      'Store Employee': 1400,
      'Janitor': 1200,
      'Mall Manager': 2500,
      
      // Special targets
      'Mall Santa': 5000,
      'Mime Artist': 3000,
      'Street Performer': 2200,
    };

    // Balanced speed bonus multipliers
    this.speedBonusMultipliers = {
      slow: 1.0,    // < 8 units/sec
      medium: 1.15, // 8-15 units/sec (reduced from 1.2)
      fast: 1.35,   // 15-25 units/sec (reduced from 1.5)
      extreme: 1.6  // > 25 units/sec (reduced from 2.0)
    };

    this.callbacks = {
      onScoreUpdate: null,
      onComboUpdate: null,
      onSpecialBonus: null
    };
  }

  // Register callbacks for UI updates
  setCallbacks({ onScoreUpdate, onComboUpdate, onSpecialBonus }) {
    if (onScoreUpdate) this.callbacks.onScoreUpdate = onScoreUpdate;
    if (onComboUpdate) this.callbacks.onComboUpdate = onComboUpdate;
    if (onSpecialBonus) this.callbacks.onSpecialBonus = onSpecialBonus;
  }

  // Calculate speed bonus based on current velocity
  getSpeedBonus(speed) {
    if (speed < this.speedBonusThreshold) return this.speedBonusMultipliers.slow;
    if (speed < 15) return this.speedBonusMultipliers.medium;
    if (speed < 25) return this.speedBonusMultipliers.fast;
    return this.speedBonusMultipliers.extreme;
  }

  // Get combo multiplier based on current combo count
  getComboMultiplier() {
    const index = Math.min(this.combo, this.multiplierLevels.length - 1);
    return this.multiplierLevels[index];
  }

  // Check if combo should be maintained or reset
  updateCombo(currentTime) {
    if (currentTime - this.lastHitTime > this.comboTimeWindow) {
      if (this.combo > 0) {
        this.combo = 0;
        this.consecutiveHits = 0;
        if (this.callbacks.onComboUpdate) {
          this.callbacks.onComboUpdate(this.combo, false); // combo broken
        }
      }
    }
  }

  // Award points for hitting a target
  awardPoints(targetLabel, speed = 0, currentTime = performance.now()) {
    this.updateCombo(currentTime);

    const basePoints = this.basePoints[targetLabel] || 50;
    const speedBonus = this.getSpeedBonus(speed);
    const comboMultiplier = this.getComboMultiplier();
    
    // Calculate final points
    let finalPoints = Math.floor(basePoints * speedBonus * comboMultiplier);

    // Bonus for hitting same type consecutively (reduced from 30% to 20%)
    if (this.lastHitType === targetLabel && this.consecutiveHits >= 2) {
      finalPoints = Math.floor(finalPoints * 1.2); // 20% bonus for consecutive same-type hits
    }

    // Apply score cap to prevent inflation
    finalPoints = Math.min(finalPoints, this.maxScorePerHit);

    // Special bonuses
    const bonusInfo = this.checkSpecialBonuses(targetLabel, speed, currentTime);
    if (bonusInfo.bonus > 0) {
      finalPoints += bonusInfo.bonus;
      if (this.callbacks.onSpecialBonus) {
        this.callbacks.onSpecialBonus(bonusInfo.message, bonusInfo.bonus);
      }
    }

    // Update combo
    this.combo++;
    this.totalHits++;
    this.lastHitTime = currentTime;
    
    // Track consecutive hits of same type
    if (this.lastHitType === targetLabel) {
      this.consecutiveHits++;
    } else {
      this.consecutiveHits = 1;
      this.lastHitType = targetLabel;
    }

    // Update max combo
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }

    // Add to total score
    this.score += finalPoints;

    // Play appropriate sounds
    this.playScoringSounds(finalPoints, this.combo);

    // Trigger callbacks
    if (this.callbacks.onScoreUpdate) {
      this.callbacks.onScoreUpdate(this.score, finalPoints, {
        basePoints,
        speedBonus,
        comboMultiplier,
        targetLabel,
        speed
      });
    }

    if (this.callbacks.onComboUpdate) {
      this.callbacks.onComboUpdate(this.combo, true); // combo increased
    }

    return {
      points: finalPoints,
      breakdown: {
        base: basePoints,
        speedMultiplier: speedBonus,
        comboMultiplier: comboMultiplier,
        specialBonus: bonusInfo.bonus
      }
    };
  }

  // Check for special scoring bonuses
  checkSpecialBonuses(targetLabel, speed, currentTime) {
    let bonus = 0;
    let message = '';

    // High-speed bonus
    if (speed > 20) {
      bonus += 200;
      message = 'SPEED DEMON!';
    }

    // Perfect combo milestones
    if (this.combo > 0 && this.combo % 10 === 0) {
      bonus += this.combo * 50;
      message = `${this.combo}X COMBO MASTER!`;
    }

    // Rare target bonus
    const rareTargets = ['Mall Santa', 'Mime Artist', 'Street Performer', 'Mall Manager'];
    if (rareTargets.includes(targetLabel)) {
      bonus += 1000;
      message = `RARE TARGET BONUS!`;
    }

    // Rapid fire bonus (multiple hits in quick succession)
    if (currentTime - this.lastHitTime < 500 && this.combo >= 3) {
      bonus += 300;
      message = 'RAPID FIRE!';
    }

    return { bonus, message };
  }

  // Play appropriate sounds for scoring
  playScoringSounds(points, combo) {
    // Play base score sound
    audioManager.playScoreSound(points);

    // Play combo sound for combos >= 3
    if (combo >= 3) {
      audioManager.playComboSound(combo);
    }

    // Special sound for high-value targets
    if (points > 1000) {
      // Play additional celebratory sound
      this._scoreSoundTimeout = setTimeout(() => {
        audioManager.playScoreSound(points * 0.5);
      }, 200);
    }
  }

  // Get current scoring statistics
  getStats() {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      totalHits: this.totalHits,
      averagePointsPerHit: this.totalHits > 0 ? Math.floor(this.score / this.totalHits) : 0,
      comboMultiplier: this.getComboMultiplier()
    };
  }

  // Reset scoring system for new game
  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalHits = 0;
    this.consecutiveHits = 0;
    this.lastHitTime = 0;
    this.lastHitType = null;
  }

  // Get formatted score display
  getFormattedScore() {
    return this.score.toLocaleString();
  }

  // Get combo display text
  getComboDisplay() {
    if (this.combo < 2) return '';
    return `${this.combo}x COMBO!`;
  }

  // Calculate potential points for a target (for UI preview)
  calculatePotentialPoints(targetLabel, speed = 0) {
    const basePoints = this.basePoints[targetLabel] || 50;
    const speedBonus = this.getSpeedBonus(speed);
    const comboMultiplier = this.getComboMultiplier();

    return Math.floor(basePoints * speedBonus * comboMultiplier);
  }

  // Clean up scoring system resources
  dispose() {
    // Explicitly remove references from callbacks to prevent memory leaks
    Object.keys(this.callbacks).forEach(key => {
      this.callbacks[key] = undefined;
    });

    // Reset all scoring data
    this.reset();
  }
}

// Export singleton instance with balanced configuration
export const scoringSystem = new ScoringSystem({
  comboTimeWindow: 2500, // 2.5 seconds for more forgiving combo timing
  multiplierLevels: [1, 1.15, 1.35, 1.6, 1.9, 2.2], // Balanced multipliers
  maxScorePerHit: 15000 // Prevent score inflation
});

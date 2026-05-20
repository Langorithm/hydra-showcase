/**
 * PhysicsState handles the "Ball in Valleys" simulation.
 * It maps a continuous value (position) to sketch indices.
 */
export class PhysicsState {
  constructor(numSketches) {
    this.numSketches = numSketches;
    
    // Simulation variables
    this.position = 0;
    this.velocity = 0;
    
    // Constants (to be tuned via DevControls)
    this.config = {
      gravity: 30.0,      // Strength of the pull towards valleys
      damping: 10.0,      // Friction to prevent endless oscillation
      scrollForce: 0.05,  // Multiplier for scroll input
      mass: 1.0           // Virtual mass of the "ball"
    };
  }

  /**
   * Apply a scroll impulse to the ball
   * @param {number} delta - The scroll delta
   */
  applyScroll(delta) {
    // Apply force based on scroll direction/magnitude
    const force = -delta * this.config.scrollForce;
    const acceleration = force / this.config.mass;
    this.velocity += acceleration;
  }

  /**
   * Update the simulation for one frame
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // 1. Calculate Restoring Force (The Valleys)
    // We use a sine wave to create potential wells at each integer
    const restoringForce = -this.config.gravity * Math.sin(2 * Math.PI * this.position);
    
    // 2. Calculate Damping (Friction)
    const dampingForce = -this.config.damping * this.velocity;
    
    // 3. Total Acceleration
    const totalAcceleration = (restoringForce + dampingForce) / this.config.mass;
    
    // 4. Integrate Velocity and Position (Euler)
    this.velocity += totalAcceleration * dt;
    this.position += this.velocity * dt;
    
    // 5. Bound the position to the sketch range
    if (this.position < 0) {
      this.position = 0;
      this.velocity = 0;
    } else if (this.position > this.numSketches - 1) {
      this.position = this.numSketches - 1;
      this.velocity = 0;
    }
  }

  /**
   * Get the current interpolation values
   * @returns {Object} { indexA, indexB, lerp }
   */
  getState() {
    const indexA = Math.floor(this.position);
    const indexB = Math.min(indexA + 1, this.numSketches - 1);
    const t = this.position - indexA;
    
    return { indexA, indexB, t };
  }
}

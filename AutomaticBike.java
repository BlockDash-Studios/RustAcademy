public class AutomaticBike {
    private boolean isOn;
    private int speed;
    private int currentGear;

    public AutomaticBike() {
        this.isOn = false;
        this.speed = 0;
        this.currentGear = 1;
    }

    /**
     * Turn the bike on
     */
    public void turnOn() {
        this.isOn = true;
        this.speed = 0;
        this.currentGear = 1;
    }

    /**
     * Turn the bike off
     */
    public void turnOff() {
        this.isOn = false;
    }

    /**
     * Check if the bike is on
     */
    public boolean isOn() {
        return this.isOn;
    }

    /**
     * Get current speed
     */
    public int getSpeed() {
        return this.speed;
    }

    /**
     * Get current gear
     */
    public int getCurrentGear() {
        return this.currentGear;
    }

    /**
     * Accelerate the bike based on current gear
     * Gear 1: +1, Gear 2: +2, Gear 3: +3, Gear 4: +4
     */
    public void accelerate() {
        if (!this.isOn) {
            return;
        }

        int increment = this.currentGear;
        this.speed += increment;

        // Auto-shift gears based on speed
        updateGear();
    }

    /**
     * Decelerate the bike based on current gear
     * Gear 1: -1, Gear 2: -2, Gear 3: -3, Gear 4: -4
     */
    public void decelerate() {
        if (!this.isOn) {
            return;
        }

        int decrement = this.currentGear;
        this.speed -= decrement;

        // Ensure speed doesn't go negative
        if (this.speed < 0) {
            this.speed = 0;
        }

        // Auto-shift gears based on speed
        updateGear();
    }

    /**
     * Update gear based on current speed
     * Gear 1: 0-20
     * Gear 2: 21-30
     * Gear 3: 31-40
     * Gear 4: 41+
     */
    private void updateGear() {
        if (this.speed <= 20) {
            this.currentGear = 1;
        } else if (this.speed <= 30) {
            this.currentGear = 2;
        } else if (this.speed <= 40) {
            this.currentGear = 3;
        } else {
            this.currentGear = 4;
        }
    }
}

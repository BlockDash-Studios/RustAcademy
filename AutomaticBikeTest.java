import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

public class AutomaticBikeTest {
    private AutomaticBike bike;

    @Before
    public void setUp() {
        bike = new AutomaticBike();
    }

    // ========== ON/OFF TESTS ==========
    @Test
    public void testBikeIsOffInitially() {
        assertFalse(bike.isOn());
    }

    @Test
    public void testBikeCanBeTurnedOn() {
        bike.turnOn();
        assertTrue(bike.isOn());
    }

    @Test
    public void testBikeCanBeTurnedOff() {
        bike.turnOn();
        bike.turnOff();
        assertFalse(bike.isOn());
    }

    @Test
    public void testSpeedIsZeroWhenTurnedOn() {
        bike.turnOn();
        assertEquals(0, bike.getSpeed());
    }

    @Test
    public void testSpeedRemainsZeroWhenTurnedOff() {
        bike.turnOn();
        bike.turnOff();
        assertEquals(0, bike.getSpeed());
    }

    // ========== GEAR TESTS ==========
    @Test
    public void testBikeStartsInGearOne() {
        bike.turnOn();
        assertEquals(1, bike.getCurrentGear());
    }

    @Test
    public void testGearOneRangeIs0To20() {
        bike.turnOn();
        assertEquals(1, bike.getCurrentGear());
        bike.accelerate();
        bike.accelerate();
        bike.accelerate();
        assertEquals(3, bike.getSpeed());
        assertEquals(1, bike.getCurrentGear());
    }

    @Test
    public void testAutoChangeToGearTwoAt21() {
        bike.turnOn();
        // Accelerate 20 times to reach speed 20 (Gear 1)
        for (int i = 0; i < 20; i++) {
            bike.accelerate();
        }
        assertEquals(20, bike.getSpeed());
        assertEquals(1, bike.getCurrentGear());

        // One more acceleration should move to Gear 2
        bike.accelerate();
        assertEquals(22, bike.getSpeed());
        assertEquals(2, bike.getCurrentGear());
    }

    @Test
    public void testAutoChangeToGearThreeAt31() {
        bike.turnOn();
        // Reach speed 30 in Gear 2
        for (int i = 0; i < 10; i++) {
            bike.accelerate();
        }
        for (int i = 0; i < 5; i++) {
            bike.accelerate();
        }
        assertEquals(30, bike.getSpeed());
        assertEquals(2, bike.getCurrentGear());

        // One more acceleration should move to Gear 3
        bike.accelerate();
        assertEquals(33, bike.getSpeed());
        assertEquals(3, bike.getCurrentGear());
    }

    @Test
    public void testAutoChangeToGearFourAt41() {
        bike.turnOn();
        // Reach speed 40 in Gear 3
        for (int i = 0; i < 10; i++) {
            bike.accelerate();
        }
        for (int i = 0; i < 5; i++) {
            bike.accelerate();
        }
        for (int i = 0; i < 3; i++) {
            bike.accelerate();
        }
        assertEquals(40, bike.getSpeed());
        assertEquals(3, bike.getCurrentGear());

        // One more acceleration should move to Gear 4
        bike.accelerate();
        assertEquals(44, bike.getSpeed());
        assertEquals(4, bike.getCurrentGear());
    }

    // ========== ACCELERATION TESTS (Gear 1: +1) ==========
    @Test
    public void testAccelerationInGearOneIncrementsBy1() {
        bike.turnOn();
        assertEquals(0, bike.getSpeed());
        bike.accelerate();
        assertEquals(1, bike.getSpeed());
    }

    @Test
    public void testMultipleAccelerationsInGearOne() {
        bike.turnOn();
        bike.accelerate();
        bike.accelerate();
        bike.accelerate();
        assertEquals(3, bike.getSpeed());
        assertEquals(1, bike.getCurrentGear());
    }

    @Test
    public void testAccelerationFromSpeed15InGearOneResultsIn16() {
        bike.turnOn();
        for (int i = 0; i < 15; i++) {
            bike.accelerate();
        }
        assertEquals(15, bike.getSpeed());
        bike.accelerate();
        assertEquals(16, bike.getSpeed());
        assertEquals(1, bike.getCurrentGear());
    }

    // ========== ACCELERATION TESTS (Gear 2: +2) ==========
    @Test
    public void testAccelerationInGearTwoIncrementsBy2() {
        bike.turnOn();
        // Move to Gear 2
        for (int i = 0; i < 21; i++) {
            bike.accelerate();
        }
        assertEquals(2, bike.getCurrentGear());
        int speedBefore = bike.getSpeed();
        bike.accelerate();
        assertEquals(speedBefore + 2, bike.getSpeed());
    }

    @Test
    public void testAccelerationFromSpeed24InGearTwoResultsIn26() {
        bike.turnOn();
        // Get to speed 24 in Gear 2
        for (int i = 0; i < 21; i++) {
            bike.accelerate();
        }
        // Now in Gear 2 at speed 22
        bike.accelerate();
        bike.accelerate();
        assertEquals(26, bike.getSpeed());
        assertEquals(2, bike.getCurrentGear());
    }

    // ========== ACCELERATION TESTS (Gear 3: +3) ==========
    @Test
    public void testAccelerationInGearThreeIncrementsBy3() {
        bike.turnOn();
        // Move to Gear 3
        for (int i = 0; i < 31; i++) {
            bike.accelerate();
        }
        assertEquals(3, bike.getCurrentGear());
        int speedBefore = bike.getSpeed();
        bike.accelerate();
        assertEquals(speedBefore + 3, bike.getSpeed());
    }

    @Test
    public void testAccelerationFromSpeed35InGearThreeResultsIn38() {
        bike.turnOn();
        // Get to speed 35 in Gear 3
        for (int i = 0; i < 21; i++) {
            bike.accelerate();
        }
        // Now in Gear 2 at speed 22, need 6 more accelerations to reach 34
        for (int i = 0; i < 6; i++) {
            bike.accelerate();
        }
        // Now at speed 34, one more should put us at 37 in Gear 3
        bike.accelerate();
        assertEquals(37, bike.getSpeed());
        assertEquals(3, bike.getCurrentGear());
        bike.accelerate();
        assertEquals(40, bike.getSpeed());
    }

    // ========== ACCELERATION TESTS (Gear 4: +4) ==========
    @Test
    public void testAccelerationInGearFourIncrementsBy4() {
        bike.turnOn();
        // Move to Gear 4
        for (int i = 0; i < 41; i++) {
            bike.accelerate();
        }
        assertEquals(4, bike.getCurrentGear());
        int speedBefore = bike.getSpeed();
        bike.accelerate();
        assertEquals(speedBefore + 4, bike.getSpeed());
    }

    @Test
    public void testAccelerationFromSpeed44InGearFourResultsIn48() {
        bike.turnOn();
        // Get to speed 44 in Gear 4
        for (int i = 0; i < 41; i++) {
            bike.accelerate();
        }
        // Now at speed 44 in Gear 4
        assertEquals(44, bike.getSpeed());
        assertEquals(4, bike.getCurrentGear());
        bike.accelerate();
        assertEquals(48, bike.getSpeed());
    }

    // ========== DECELERATION TESTS (Gear 1: -1) ==========
    @Test
    public void testDecelerationInGearOneDecrementsBy1() {
        bike.turnOn();
        bike.accelerate();
        bike.accelerate();
        bike.accelerate();
        assertEquals(3, bike.getSpeed());
        bike.decelerate();
        assertEquals(2, bike.getSpeed());
        assertEquals(1, bike.getCurrentGear());
    }

    @Test
    public void testDecelerationFromSpeed15InGearOneResultsIn14() {
        bike.turnOn();
        for (int i = 0; i < 15; i++) {
            bike.accelerate();
        }
        assertEquals(15, bike.getSpeed());
        bike.decelerate();
        assertEquals(14, bike.getSpeed());
        assertEquals(1, bike.getCurrentGear());
    }

    @Test
    public void testDecelerationCantGoNegative() {
        bike.turnOn();
        bike.decelerate();
        assertEquals(0, bike.getSpeed());
    }

    // ========== DECELERATION TESTS (Gear 2: -2) ==========
    @Test
    public void testDecelerationInGearTwoDecrementsBy2() {
        bike.turnOn();
        // Move to Gear 2
        for (int i = 0; i < 21; i++) {
            bike.accelerate();
        }
        assertEquals(2, bike.getCurrentGear());
        int speedBefore = bike.getSpeed();
        bike.decelerate();
        assertEquals(speedBefore - 2, bike.getSpeed());
    }

    @Test
    public void testDecelerationFromSpeed24InGearTwoResultsIn22() {
        bike.turnOn();
        // Get to speed 24 in Gear 2
        for (int i = 0; i < 21; i++) {
            bike.accelerate();
        }
        // Now in Gear 2 at speed 22
        bike.accelerate();
        bike.accelerate();
        assertEquals(26, bike.getSpeed());
        bike.decelerate();
        assertEquals(24, bike.getSpeed());
        assertEquals(2, bike.getCurrentGear());
    }

    @Test
    public void testDecelerationFrom21InGearTwoMovesToGearOne() {
        bike.turnOn();
        // Move to Gear 2
        for (int i = 0; i < 21; i++) {
            bike.accelerate();
        }
        assertEquals(22, bike.getSpeed());
        assertEquals(2, bike.getCurrentGear());
        bike.decelerate();
        assertEquals(20, bike.getSpeed());
        assertEquals(1, bike.getCurrentGear());
    }

    // ========== DECELERATION TESTS (Gear 3: -3) ==========
    @Test
    public void testDecelerationInGearThreeDecrementsBy3() {
        bike.turnOn();
        // Move to Gear 3
        for (int i = 0; i < 31; i++) {
            bike.accelerate();
        }
        assertEquals(3, bike.getCurrentGear());
        int speedBefore = bike.getSpeed();
        bike.decelerate();
        assertEquals(speedBefore - 3, bike.getSpeed());
    }

    @Test
    public void testDecelerationFromSpeed35InGearThreeResultsIn32() {
        bike.turnOn();
        // Get to speed 35 in Gear 3 - reach Gear 2 first at 22
        for (int i = 0; i < 21; i++) {
            bike.accelerate();
        }
        // Add more to get to speed 35
        for (int i = 0; i < 6; i++) {
            bike.accelerate();
        }
        // Should be at 34, add one more to get 37 in Gear 3
        bike.accelerate();
        assertEquals(37, bike.getSpeed());
        bike.decelerate();
        assertEquals(34, bike.getSpeed());
        assertEquals(3, bike.getCurrentGear());
    }

    @Test
    public void testDecelerationFrom31InGearThreeMovesToGearTwo() {
        bike.turnOn();
        // Move to Gear 3
        for (int i = 0; i < 31; i++) {
            bike.accelerate();
        }
        assertEquals(33, bike.getSpeed());
        assertEquals(3, bike.getCurrentGear());
        bike.decelerate();
        assertEquals(30, bike.getSpeed());
        assertEquals(2, bike.getCurrentGear());
    }

    // ========== DECELERATION TESTS (Gear 4: -4) ==========
    @Test
    public void testDecelerationInGearFourDecrementsBy4() {
        bike.turnOn();
        // Move to Gear 4
        for (int i = 0; i < 41; i++) {
            bike.accelerate();
        }
        assertEquals(4, bike.getCurrentGear());
        int speedBefore = bike.getSpeed();
        bike.decelerate();
        assertEquals(speedBefore - 4, bike.getSpeed());
    }

    @Test
    public void testDecelerationFromSpeed44InGearFourResultsIn40() {
        bike.turnOn();
        // Get to speed 44 in Gear 4
        for (int i = 0; i < 41; i++) {
            bike.accelerate();
        }
        assertEquals(44, bike.getSpeed());
        assertEquals(4, bike.getCurrentGear());
        bike.decelerate();
        assertEquals(40, bike.getSpeed());
        assertEquals(3, bike.getCurrentGear());
    }

    @Test
    public void testDecelerationFrom41InGearFourMovesToGearThree() {
        bike.turnOn();
        // Move to Gear 4
        for (int i = 0; i < 41; i++) {
            bike.accelerate();
        }
        assertEquals(44, bike.getSpeed());
        assertEquals(4, bike.getCurrentGear());
        bike.decelerate();
        bike.decelerate();
        bike.decelerate();
        assertEquals(32, bike.getSpeed());
        assertEquals(3, bike.getCurrentGear());
    }

    // ========== ACCELERATION/DECELERATION WHILE OFF TESTS ==========
    @Test
    public void testCannotAccelerateWhenBikeIsOff() {
        bike.accelerate();
        assertEquals(0, bike.getSpeed());
    }

    @Test
    public void testCannotDecelerateWhenBikeIsOff() {
        bike.decelerate();
        assertEquals(0, bike.getSpeed());
    }

    // ========== INTEGRATION TESTS ==========
    @Test
    public void testCompleteAccelerationAndDecelerationCycle() {
        bike.turnOn();

        // Accelerate to Gear 3
        for (int i = 0; i < 35; i++) {
            bike.accelerate();
        }
        assertEquals(35, bike.getSpeed());
        assertEquals(3, bike.getCurrentGear());

        // Decelerate back
        for (int i = 0; i < 10; i++) {
            bike.decelerate();
        }
        assertEquals(5, bike.getSpeed());
        assertEquals(1, bike.getCurrentGear());

        // Turn off
        bike.turnOff();
        assertFalse(bike.isOn());
        assertEquals(5, bike.getSpeed());
    }

    @Test
    public void testAllGearRangesCorrectly() {
        bike.turnOn();

        // Gear 1: 0-20
        assertEquals(1, bike.getCurrentGear());
        for (int i = 0; i < 20; i++) {
            bike.accelerate();
        }
        assertEquals(20, bike.getSpeed());
        assertEquals(1, bike.getCurrentGear());

        // Transition to Gear 2: 21-30
        bike.accelerate();
        assertEquals(22, bike.getSpeed());
        assertEquals(2, bike.getCurrentGear());

        for (int i = 0; i < 4; i++) {
            bike.accelerate();
        }
        assertEquals(30, bike.getSpeed());
        assertEquals(2, bike.getCurrentGear());

        // Transition to Gear 3: 31-40
        bike.accelerate();
        assertEquals(33, bike.getSpeed());
        assertEquals(3, bike.getCurrentGear());

        for (int i = 0; i < 2; i++) {
            bike.accelerate();
        }
        assertEquals(39, bike.getSpeed());
        assertEquals(3, bike.getCurrentGear());

        // Transition to Gear 4: 41+
        bike.accelerate();
        assertEquals(43, bike.getSpeed());
        assertEquals(4, bike.getCurrentGear());

        bike.accelerate();
        assertEquals(47, bike.getSpeed());
        assertEquals(4, bike.getCurrentGear());
    }

    @Test
    public void testRapidAccelerationAndDeceleration() {
        bike.turnOn();

        for (int i = 0; i < 10; i++) {
            bike.accelerate();
        }
        assertEquals(10, bike.getSpeed());

        for (int i = 0; i < 5; i++) {
            bike.decelerate();
        }
        assertEquals(5, bike.getSpeed());

        for (int i = 0; i < 20; i++) {
            bike.accelerate();
        }
        assertEquals(25, bike.getSpeed());
        assertEquals(2, bike.getCurrentGear());
    }
}

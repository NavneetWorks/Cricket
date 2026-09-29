import { CANVAS_WIDTH, CANVAS_HEIGHT } from "./constants";

export class Camera {
    // The horizon line is exactly at 50% of the screen height. 
    // The Z-axis ground will never render above this line.
    static readonly HORIZON_Y = CANVAS_HEIGHT / 2;
    
    // The very bottom edge of the screen represents Z = 0 (closest to the viewer)
    static readonly BOTTOM_Y = CANVAS_HEIGHT;

    // This controls the "strength" of the 3D perspective.
    // Higher numbers make the depth less extreme. Lower numbers make objects shrink very quickly.
    static readonly FOCAL_LENGTH = 1000;

    // The vanishing point for the X-axis (objects pull towards the center as they go into the distance)
    static readonly VANISHING_POINT_X = CANVAS_WIDTH / 2;

    /**
     * Converts a 3D Game World coordinate into 2D Screen Canvas coordinates.
     * 
     * @param worldX Left/Right position in the game world
     * @param worldY Height in the air (0 is touching the ground)
     * @param worldZ Distance from the camera (depth into the screen)
     */
    static project(worldX: number, worldY: number, worldZ: number) {
        // 1. Calculate how small the object gets based on its Z depth
        const scale = this.FOCAL_LENGTH / (this.FOCAL_LENGTH + worldZ);

        // 2. Calculate the base Y position on the screen (as if it was touching the ground)
        // Starts at BOTTOM_Y (when scale=1) and pulls up towards HORIZON_Y (when scale shrinks)
        const shadowScreenY = this.HORIZON_Y + (this.BOTTOM_Y - this.HORIZON_Y) * scale;

        // 3. Subtract worldY to make the object jump/fly into the air on the screen
        const screenY = shadowScreenY - (worldY * scale);

        // 4. Calculate the Screen X position
        // Pulls the X coordinate towards the center of the screen as it goes further away
        const screenX = this.VANISHING_POINT_X + (worldX - this.VANISHING_POINT_X) * scale;

        return {
            screenX: screenX,
            screenY: screenY,
            shadowScreenY: shadowScreenY, // Draw your ground shadow exactly here!
            scale: scale
        };
    }
}

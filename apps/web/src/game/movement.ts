export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

export interface MovementVector {
  x: number;
  z: number;
}

export function movementVector(input: MovementInput, cameraYaw: number): MovementVector {
  const forward = Number(input.forward) - Number(input.backward);
  const right = Number(input.left) - Number(input.right);
  const x = Math.sin(cameraYaw) * forward + Math.cos(cameraYaw) * right;
  const z = Math.cos(cameraYaw) * forward - Math.sin(cameraYaw) * right;
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z };
  return { x: x / length, z: z / length };
}

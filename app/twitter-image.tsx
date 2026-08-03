import { createSocialImage } from "./social-image";

export const alt = "A blue doodle of a bear sketching a wireframe";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return createSocialImage();
}

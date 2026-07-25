import type { CategoryIconName } from "@/src/types/map";

const iconFileByName: Record<CategoryIconName, string> = {
  GraduationCap: "graduation-cap",
  Stethoscope: "stethoscope",
  ShoppingBag: "shopping-bag",
  Trees: "trees",
  TrainFront: "train-front",
  Factory: "factory",
  Flower2: "flower-2",
  Zap: "zap",
  ShieldAlert: "shield-alert",
};

const image = (fileName: string, className: string, size: number) => (
  `<img class="${className}" width="${size}" height="${size}" alt="" src="/map-icons/${fileName}.svg"/>`
);

export const categoryIconSvg: Record<CategoryIconName, string> = Object.fromEntries(
  Object.entries(iconFileByName).map(([name, fileName]) => [
    name,
    image(fileName, "place-marker-icon", 14),
  ]),
) as Record<CategoryIconName, string>;

export const projectHouseIconSvg = image("house", "project-pin-icon", 15);

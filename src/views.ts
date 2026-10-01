export type Vec3 = readonly [number, number, number];
export interface PoemView {
  id: string;
  text: string;
  number: string;
  caption: string;
  place: string;
  camera: Vec3;
  target: Vec3;
}
export const views: PoemView[] = [
  {
    id: "mountains",
    text: "千山鸟飞绝",
    number: "第一境 · 千山",
    caption: "群山入雪，天地无声。",
    place: "远山 · 空寂",
    camera: [200, 142, 215],
    target: [-4, 34, -74],
  },
  {
    id: "paths",
    text: "万径人踪灭",
    number: "第二境 · 万径",
    caption: "雪覆旧径，不见来人。",
    place: "雪径 · 无踪",
    camera: [-80, 42, 96],
    target: [-36, 7, 19],
  },
  {
    id: "boat",
    text: "孤舟蓑笠翁",
    number: "第三境 · 孤舟",
    caption: "一舟一人，静对山河。",
    place: "孤舟 · 蓑笠",
    camera: [81, 36, 98],
    target: [26, 4, 36],
  },
  {
    id: "fishing",
    text: "独钓寒江雪",
    number: "第四境 · 独钓",
    caption: "寒江独钓，风雪自来。",
    place: "寒江 · 坚守",
    camera: [39, 9.5, 52],
    target: [26, 3.2, 36],
  },
];
export const overview: PoemView = {
  id: "overview",
  text: "一片寂静的天地",
  number: "全境 · 江雪",
  caption: "千山、万径、孤舟，同在一江风雪中。",
  place: "全境",
  camera: [160, 245, 220],
  target: [0, 16, -30],
};

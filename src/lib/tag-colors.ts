export const TAG_COLORS = ['gray','green','blue','purple','orange','red','yellow','teal','pink'] as const;
export type TagColor = typeof TAG_COLORS[number];
export function validTagColor(value:unknown):value is TagColor{return typeof value==='string'&&TAG_COLORS.includes(value as TagColor);}

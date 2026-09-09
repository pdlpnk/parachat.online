export type AdminTagView = Readonly<{
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  userCount: number;
}>;

export type AdminTagAssignmentView = Pick<AdminTagView, "id" | "name">;

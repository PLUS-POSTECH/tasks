import { handleOperationRequest } from "@/lib/operations/http";

export const POST = async (request: Request, context: RouteContext<"/api/operations/[name]">): Promise<Response> => {
  const { name } = await context.params;
  let input: unknown = {};
  const text = await request.text();
  if (text.trim().length > 0) {
    try {
      input = JSON.parse(text);
    } catch {
      return Response.json({ error: "Body must be JSON." }, { status: 400 });
    }
  }
  return handleOperationRequest(request, name, input);
};

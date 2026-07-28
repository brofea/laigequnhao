import app from "../_lib/app";

export const onRequest: PagesFunction = (context) => {
  return app.fetch(context.request, context.env, context);
};

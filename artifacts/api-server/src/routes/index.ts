import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import chatsRouter from "./chats";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(chatsRouter);
router.use(storageRouter);

export default router;

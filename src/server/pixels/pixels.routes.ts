import { Router } from 'express';
import authRouter from './api/auth/auth.routes';
import numbersRouter from './api/numbers/numbers.routes';
import categoriesRouter from './api/categories/categories.routes';
import cartRouter from './api/cart/cart.routes';
import wishlistRouter from './api/wishlist/wishlist.routes';
import ordersRouter from './api/orders/orders.routes';
import paymentsRouter from './api/payments/payments.routes';
import reviewsRouter from './api/reviews/reviews.routes';
import testimonialsRouter from './api/testimonials/testimonials.routes';
import bannersRouter from './api/banners/banners.routes';
import dealerRouter from './api/dealer/dealer.routes';
import referralRouter from './api/referral/referral.routes';
import dashboardRouter from './api/dashboard/dashboard.routes';
import adminRouter from './api/admin/admin.routes';
import notificationsRouter from './api/notifications/notifications.routes';
import contactRouter from './api/contact/contact.routes';
import siteRouter from './api/site/site.routes';

// VIP Number World API — mounted at /vipnumberworld
const vnwRouter = Router();

vnwRouter.use('/auth', authRouter);
vnwRouter.use('/numbers', numbersRouter);
vnwRouter.use('/categories', categoriesRouter);
vnwRouter.use('/cart', cartRouter);
vnwRouter.use('/wishlist', wishlistRouter);
vnwRouter.use('/orders', ordersRouter);
vnwRouter.use('/payments', paymentsRouter);
vnwRouter.use('/reviews', reviewsRouter);
vnwRouter.use('/testimonials', testimonialsRouter);
vnwRouter.use('/banners', bannersRouter);
vnwRouter.use('/dealer', dealerRouter);
vnwRouter.use('/referral', referralRouter);
vnwRouter.use('/dashboard', dashboardRouter);
vnwRouter.use('/admin', adminRouter);
vnwRouter.use('/notifications', notificationsRouter);
vnwRouter.use('/contact', contactRouter);
vnwRouter.use('/site', siteRouter);

export default vnwRouter;

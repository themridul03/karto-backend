import prisma from "../prisma.js";

/* =========================================
   HELPERS
========================================= */

const clean =
  (value) =>
    value === undefined ||
    value === null
      ? ""
      : String(value).trim();

/* =========================================
   REGISTER / UPDATE PUSH TOKEN
========================================= */

export const registerPushToken =
  async (req, res) => {
    try {
      const userId =
        req.user?.id;

      const token =
        clean(
          req.body?.token
        );

      const platform =
        clean(
          req.body?.platform
        ).toUpperCase() ||
        "ANDROID";

      const deviceId =
        clean(
          req.body?.deviceId
        ) || null;

      if (!userId) {
        return res
          .status(401)
          .json({
            success: false,
            message:
              "Unauthorized",
          });
      }

      if (!token) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Push token is required",
          });
      }

      /*
       * Same Firebase token must belong to
       * only one current user.
       *
       * First find it.
       */
      const existing =
        await prisma.pushToken.findFirst({
          where: {
            token,
          },
        });

      let pushToken;

      if (existing) {
        pushToken =
          await prisma.pushToken.update({
            where: {
              id:
                existing.id,
            },

            data: {
              userId,

              platform,

              deviceId,

              isActive:
                true,
            },
          });
      } else {
        pushToken =
          await prisma.pushToken.create({
            data: {
              userId,

              token,

              platform,

              deviceId,

              isActive:
                true,
            },
          });
      }

      console.log(
        "[PUSH TOKEN REGISTERED]",
        {
          id:
            pushToken.id,

          userId:
            pushToken.userId,

          platform:
            pushToken.platform,

          deviceId:
            pushToken.deviceId,

          isActive:
            pushToken.isActive,
        }
      );

      return res.json({
        success: true,

        message:
          "Push token registered successfully",

        pushToken: {
          id:
            pushToken.id,

          userId:
            pushToken.userId,

          platform:
            pushToken.platform,

          deviceId:
            pushToken.deviceId,

          isActive:
            pushToken.isActive,
        },
      });
    } catch (error) {
      console.error(
        "Register Push Token Error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to register push token",
        });
    }
  };

/* =========================================
   DISABLE CURRENT DEVICE TOKEN
========================================= */

export const unregisterPushToken =
  async (req, res) => {
    try {
      const userId =
        req.user?.id;

      const token =
        clean(
          req.body?.token
        );

      const deviceId =
        clean(
          req.body?.deviceId
        );

      if (!userId) {
        return res
          .status(401)
          .json({
            success: false,
            message:
              "Unauthorized",
          });
      }

      if (
        !token &&
        !deviceId
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "token or deviceId is required",
          });
      }

      const result =
        await prisma.pushToken.updateMany({
          where: {
            userId,

            ...(token
              ? {
                  token,
                }
              : {}),

            ...(deviceId
              ? {
                  deviceId,
                }
              : {}),
          },

          data: {
            isActive:
              false,
          },
        });

      return res.json({
        success: true,

        message:
          "Push token disabled",

        count:
          result.count,
      });
    } catch (error) {
      console.error(
        "Unregister Push Token Error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to unregister push token",
        });
    }
  };

/* =========================================
   CURRENT USER TOKENS
========================================= */

export const getMyPushTokens =
  async (req, res) => {
    try {
      const userId =
        req.user?.id;

      if (!userId) {
        return res
          .status(401)
          .json({
            success: false,
            message:
              "Unauthorized",
          });
      }

      const tokens =
        await prisma.pushToken.findMany({
          where: {
            userId,
          },

          orderBy: {
            updatedAt:
              "desc",
          },

          select: {
            id: true,

            platform:
              true,

            deviceId:
              true,

            isActive:
              true,

            createdAt:
              true,

            updatedAt:
              true,
          },
        });

      return res.json({
        success: true,
        tokens,
      });
    } catch (error) {
      console.error(
        "Get Push Tokens Error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to fetch push tokens",
        });
    }
  };
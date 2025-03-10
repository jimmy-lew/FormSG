import { celebrate, Joi, Segments } from 'celebrate'
import { StatusCodes } from 'http-status-codes'
import { ok } from 'neverthrow'

import { ErrorDto, FormAuthType } from '../../../../shared/types'
import { SALT_ROUNDS } from '../../../../shared/utils/verification'
import { createLoggerWithLabel } from '../../config/logger'
import { generateOtpWithHash } from '../../utils/otp'
import { createReqMeta, getRequestIp } from '../../utils/request'
import { ControllerHandler } from '../core/core.types'
import { setFormTags } from '../datadog/datadog.utils'
import * as FormService from '../form/form.service'
import * as MyInfoUtil from '../myinfo/myinfo.util'
import { SgidService } from '../sgid/sgid.service'
import { getOidcService } from '../spcp/spcp.oidc.service'

import * as VerificationService from './verification.service'
import { Transaction } from './verification.types'
import { mapRouteError } from './verification.util'

const logger = createLoggerWithLabel(module)

/**
 * NOTE: Private handler for POST /transaction
 * When a form is loaded publicly, a transaction is created, and populated with the field ids of fields that are verifiable.
 * If no fields are verifiable, then it did not create a transaction and returns an empty object.
 * @deprecated in favour of handleCreateVerificationTransaction
 * @param req
 * @param res
 * @returns 201 - transaction is created
 * @returns 200 - transaction was not created as no fields were verifiable for the form
 */
export const handleCreateTransaction: ControllerHandler<
  never,
  Transaction | ErrorDto,
  { formId: string }
> = async (req, res) => {
  const { formId } = req.body
  const logMeta = {
    action: 'handleCreateTransaction',
    formId,
    ...createReqMeta(req),
  }
  return VerificationService.createTransaction(formId)
    .map((transaction) => {
      return transaction
        ? res.status(StatusCodes.CREATED).json({
            expireAt: transaction.expireAt,
            transactionId: transaction._id,
          })
        : res.status(StatusCodes.OK).json({})
    })
    .mapErr((error) => {
      logger.error({
        message: 'Error creating transaction',
        meta: logMeta,
        error,
      })
      const { errorMessage, statusCode } = mapRouteError(error)
      return res.status(statusCode).json({ message: errorMessage })
    })
}

/**
 * NOTE: Private handler for POST /forms/:formId/fieldverifications
 * When a form is loaded publicly, a transaction is created, and populated with the field ids of fields that are verifiable.
 * If no fields are verifiable, then it did not create a transaction and returns an empty object.
 * @param req
 * @param res
 * @returns 201 - transaction is created
 * @returns 200 - transaction was not created as no fields were verifiable for the form
 */
export const handleCreateVerificationTransaction: ControllerHandler<
  { formId: string },
  Transaction | ErrorDto
> = async (req, res) => {
  const { formId } = req.params
  const logMeta = {
    action: 'handleCreateVerificationTransaction',
    formId,
    ...createReqMeta(req),
  }
  return VerificationService.createTransaction(formId)
    .map((transaction) => {
      return transaction
        ? res.status(StatusCodes.CREATED).json({
            expireAt: transaction.expireAt,
            transactionId: transaction._id,
          })
        : res.status(StatusCodes.OK).json({})
    })
    .mapErr((error) => {
      logger.error({
        message: 'Error creating transaction',
        meta: logMeta,
        error,
      })
      const { errorMessage, statusCode } = mapRouteError(error)
      return res.status(statusCode).json({ message: errorMessage })
    })
}

/**
 *  When user changes the input value in the verifiable field,
 *  we reset the field in the transaction, removing the previously saved signature.
 * @deprecated in favour of handleResetFieldVerification
 * @param req
 * @param res
 * @deprecated in favour of handleGenerateOtp
 */
export const handleResetField: ControllerHandler<
  { transactionId: string },
  ErrorDto,
  { fieldId: string }
> = async (req, res) => {
  const { transactionId } = req.params
  const { fieldId } = req.body
  const logMeta = {
    action: 'handleResetField',
    transactionId,
    fieldId,
    ...createReqMeta(req),
  }
  return VerificationService.resetFieldForTransaction(transactionId, fieldId)
    .map(() => res.sendStatus(StatusCodes.OK))
    .mapErr((error) => {
      logger.error({
        message: 'Error resetting field in transaction',
        meta: logMeta,
        error,
      })
      const { errorMessage, statusCode } = mapRouteError(error)
      return res.status(statusCode).json({ message: errorMessage })
    })
}

/**
 * When user requests to verify a field, an otp is generated.
 * The current answer is signed, and the signature is also saved in the transaction, with the field id as the key.
 * @param req
 * @param res
 * @deprecated in favour of handleGenerateOtp
 */
export const handleGetOtp: ControllerHandler<
  { transactionId: string },
  ErrorDto,
  { answer: string; fieldId: string }
> = async (req, res) => {
  const { transactionId } = req.params
  const { answer, fieldId } = req.body
  const senderIp = getRequestIp(req)

  const logMeta = {
    action: 'handleGetOtp',
    transactionId,
    fieldId,
    ...createReqMeta(req),
  }
  return generateOtpWithHash(logMeta, SALT_ROUNDS)
    .andThen(({ otp, hashedOtp }) =>
      VerificationService.sendNewOtp({
        fieldId,
        hashedOtp,
        otp,
        recipient: answer,
        transactionId,
        senderIp,
      }),
    )
    .map(() => res.sendStatus(StatusCodes.CREATED))
    .mapErr((error) => {
      logger.error({
        message: 'Error creating new OTP',
        meta: logMeta,
        error,
      })
      const { errorMessage, statusCode } = mapRouteError(error)
      return res.status(statusCode).json({ message: errorMessage })
    })
}

/**
 * NOTE: This is exported solely for testing
 * Generates an otp when a user requests to verify a field.
 * The current answer is signed, and the signature is also saved in the transaction, with the field id as the key.
 * @param answer The mobile or email number of the user
 * @param transactionId The id of the transaction to verify
 * @param formId The id of the form to verify
 * @param fieldId The id of the field to verify
 * @returns 201 when otp generated successfully
 * @returns 400 when the parameters could not be parsed
 * @returns 400 when the transaction has expired
 * @returns 400 when the otp could not be sent via sms
 * @returns 400 when the otp could not be sent via email
 * @returns 400 when the provided phone number is not valid
 * @returns 400 when the field type is not supported for validation
 * @returns 404 when the requested form was not found
 * @returns 404 when the transaction was not found
 * @returns 404 when the field was not found
 * @returns 422 when the user requested for a new otp without waiting
 * @returns 500 when the otp could not be hashed
 * @returns 500 when there is a database error
 */
export const _handleGenerateOtp: ControllerHandler<
  { transactionId: string; formId: string; fieldId: string },
  ErrorDto,
  { answer: string }
> = async (req, res) => {
  const { transactionId, formId, fieldId } = req.params
  const { answer } = req.body
  const senderIp = getRequestIp(req)

  const logMeta = {
    action: 'handleGenerateOtp',
    transactionId,
    fieldId,
    ...createReqMeta(req),
  }
  // Step 1: Ensure that the form for the specified transaction exists
  return (
    FormService.retrieveFullFormById(formId)
      // Step 2: Verify SPCP/MyInfo, if form requires it
      .andThen((form) => {
        setFormTags(form)
        const { authType } = form
        switch (authType) {
          case FormAuthType.CP: {
            const oidcService = getOidcService(FormAuthType.CP)
            return oidcService
              .extractJwt(req.cookies)
              .asyncAndThen((jwt) => oidcService.extractJwtPayload(jwt))
              .map(() => form)
              .mapErr((error) => {
                logger.error({
                  message: 'Failed to verify Corppass JWT with cp oidc client',
                  meta: logMeta,
                  error,
                })
                return error
              })
          }
          case FormAuthType.SP: {
            const oidcService = getOidcService(FormAuthType.SP)
            return oidcService
              .extractJwt(req.cookies)
              .asyncAndThen((jwt) => oidcService.extractJwtPayload(jwt))
              .map(() => form)
              .mapErr((error) => {
                logger.error({
                  message: 'Failed to verify Singpass JWT with sp oidc client',
                  meta: logMeta,
                  error,
                })
                return error
              })
          }
          case FormAuthType.SGID:
            return SgidService.extractSgidJwtPayload(req.cookies.jwtSgid)
              .map(() => form)
              .mapErr((error) => {
                logger.error({
                  message: 'Failed to verify sgID JWT with auth client',
                  meta: logMeta,
                  error,
                })
                return error
              })
          case FormAuthType.MyInfo:
            return MyInfoUtil.extractMyInfoCookie(req.cookies)
              .andThen(MyInfoUtil.extractAccessTokenFromCookie)
              .map(() => form)
              .mapErr((error) => {
                logger.error({
                  message: 'Failed to verify MyInfo hashes',
                  meta: logMeta,
                  error,
                })
                return error
              })
          default:
            return ok(form)
        }
      })
      .andThen((form) =>
        generateOtpWithHash(logMeta, SALT_ROUNDS)
          .andThen(({ otp, hashedOtp }) =>
            // Step 3: Send otp
            VerificationService.sendNewOtp({
              fieldId,
              hashedOtp,
              otp,
              recipient: answer,
              transactionId,
              senderIp,
            }),
          )
          // Return the required data for next steps.
          .map((updatedTransaction) => ({ updatedTransaction, form })),
      )
      .map(({ updatedTransaction, form }) => {
        res.sendStatus(StatusCodes.CREATED)
        // NOTE: This is returned because tests require this to avoid async mocks interfering with each other.
        // However, this is not an issue in reality because express does not require awaiting on the sendStatus call.
        return VerificationService.disableVerifiedFieldsIfRequired(
          form,
          updatedTransaction,
          fieldId,
        )
      })
      .mapErr((error) => {
        logger.error({
          message: 'Error creating new OTP',
          meta: logMeta,
          error,
        })
        const { errorMessage, statusCode } = mapRouteError(error)
        return res.status(statusCode).json({ message: errorMessage })
      })
  )
}

/**
 * Handler for the POST /forms/:formId/fieldverifications/:transactionId/fields/:fieldId/otp/generate endpoint
 */
export const handleGenerateOtp = [
  celebrate({
    [Segments.BODY]: Joi.object({
      answer: Joi.string().required(),
    }),
  }),
  _handleGenerateOtp,
] as ControllerHandler[]

/**
 * When user submits their otp for the field, the otp is validated.
 * If it is correct, we return the signature that was saved.
 * This signature will be appended to the response when the form is submitted.
 * @param req
 * @param res
 * @deprecated in favour of handleOtpVerification
 */
export const handleVerifyOtp: ControllerHandler<
  { transactionId: string },
  string | ErrorDto,
  { otp: string; fieldId: string }
> = async (req, res) => {
  const { transactionId } = req.params
  const { fieldId, otp } = req.body
  const logMeta = {
    action: 'handleVerifyOtp',
    transactionId,
    fieldId,
    ...createReqMeta(req),
  }
  return VerificationService.verifyOtp(transactionId, fieldId, otp)
    .map((signedData) => res.status(StatusCodes.OK).json(signedData))
    .mapErr((error) => {
      logger.error({
        message: 'Error verifying OTP',
        meta: logMeta,
        error,
      })
      const { statusCode, errorMessage } = mapRouteError(error)
      return res.status(statusCode).json({ message: errorMessage })
    })
}

/**
 * NOTE: Exported solely for testing
 * Handler for otp verification; double checks the submitted otp against the true otp
 * If the submitted otp is correct,
 * the signature that was saved will be appended to the response of the form when submitted
 * @param formId The id of the form which verification is for
 * @param transactionId The id of the transaction to validate
 * @param fieldId The id of the field to validate
 * @returns 200 when the otp is correct and the parameters are valid
 * @returns 400 when TransactionExpiredError occurs
 * @returns 400 when MissingHashDataError occurs
 * @returns 404 when FormNotFoundError occurs
 * @returns 404 when TransactionNotFoundError occurs
 * @returns 404 when FieldNotFoundInTransactionError occurs
 * @returns 422 when OtpExpiredError occurs
 * @returns 422 when OtpRetryExceededError occurs
 * @returns 422 when WrongOtpError occurs
 * @returns 500 when HashingError occurs
 * @returns 500 when DatabaseError occurs
 */
export const _handleOtpVerification: ControllerHandler<
  { transactionId: string; fieldId: string; formId: string },
  string | ErrorDto,
  { otp: string }
> = async (req, res) => {
  const { transactionId, fieldId, formId } = req.params
  const { otp } = req.body
  const logMeta = {
    action: '_handleOtpVerification',
    transactionId,
    fieldId,
    ...createReqMeta(req),
  }
  // Step 1: Ensure that the form for the specified transaction exists
  return (
    FormService.retrieveFormById(formId)
      // Step 2: Verify the otp sent over by the client
      .andThen(() => VerificationService.verifyOtp(transactionId, fieldId, otp))
      .map((signedData) => res.status(StatusCodes.OK).json(signedData))
      .mapErr((error) => {
        logger.error({
          message: 'Error verifying OTP',
          meta: logMeta,
          error,
        })
        const { statusCode, errorMessage } = mapRouteError(error)
        return res.status(statusCode).json({ message: errorMessage })
      })
  )
}

/**
 * Handler with otp validation for POST /forms/:formId/fieldverifications/:id/fields/:fieldId/otp/verify
 */
export const handleOtpVerification = [
  celebrate({
    [Segments.BODY]: Joi.object({
      otp: Joi.string()
        .required()
        .regex(/^\d{6}$/)
        .message('Please enter a valid OTP'),
    }),
  }),
  _handleOtpVerification,
] as ControllerHandler[]

/**
 * Handler for resetting the verification state of a field.
 * @param formId The id of the form to reset the field verification for
 * @param fieldId The id of the field to reset verification for
 * @param transactionId The transaction to reset
 * @returns 204 when reset is successful
 * @returns 400 when the transaction has expired
 * @returns 404 when the form could not be found
 * @returns 404 when the transaction could not be found
 * @returns 404 when the field could not be found
 * @returns 500 when a database error occurs
 */
export const handleResetFieldVerification: ControllerHandler<
  {
    formId: string
    fieldId: string
    transactionId: string
  },
  ErrorDto
> = async (req, res) => {
  const { transactionId, fieldId, formId } = req.params
  const logMeta = {
    action: 'handleResetFieldVerification',
    transactionId,
    fieldId,
    ...createReqMeta(req),
  }
  return FormService.retrieveFormById(formId)
    .andThen(() =>
      VerificationService.resetFieldForTransaction(transactionId, fieldId),
    )
    .map(() => res.sendStatus(StatusCodes.NO_CONTENT))
    .mapErr((error) => {
      logger.error({
        message: 'Error resetting field in transaction',
        meta: logMeta,
        error,
      })
      const { errorMessage, statusCode } = mapRouteError(error)
      return res.status(statusCode).json({ message: errorMessage })
    })
}

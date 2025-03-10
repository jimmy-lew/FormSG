import { err, errAsync, ok, okAsync } from 'neverthrow'
import { mocked } from 'ts-jest/utils'

import config from 'src/app/config/config'
import * as FormService from 'src/app/modules/form/form.service'
import { MOCK_COOKIE_AGE } from 'src/app/modules/myinfo/__tests__/myinfo.test.constants'

import expressHandler from 'tests/unit/backend/helpers/jest-express'

import { FormAuthType } from '../../../../../shared/types'
import * as BillingService from '../../billing/billing.service'
import { ApplicationError, DatabaseError } from '../../core/core.errors'
import { FormNotFoundError } from '../../form/form.errors'
import * as SpcpController from '../spcp.controller'
import {
  CreateJwtError,
  InvalidIdTokenError,
  InvalidOOBParamsError,
  InvalidStateError,
  MissingAttributesError,
  RetrieveAttributesError,
} from '../spcp.errors'
import { CpOidcServiceClass } from '../spcp.oidc.service/spcp.oidc.service.cp'
import { SpOidcServiceClass } from '../spcp.oidc.service/spcp.oidc.service.sp'
import { SpcpService } from '../spcp.service'
import { JwtName } from '../spcp.types'

import {
  MOCK_ATTRIBUTES,
  MOCK_COOKIE_SETTINGS,
  MOCK_CP_FORM,
  MOCK_CP_OIDC_AUTHORISATION_CODE,
  MOCK_CP_OIDC_EXTRACTED_NDI_PAYLOAD,
  MOCK_CP_OIDC_JWT_PAYLOAD,
  MOCK_CP_SAML,
  MOCK_DESTINATION,
  MOCK_JWT,
  MOCK_JWT_PAYLOAD,
  MOCK_LOGIN_DOC,
  MOCK_OIDC_STATE,
  MOCK_RELAY_STATE,
  MOCK_REMEMBER_ME,
  MOCK_SP_FORM,
  MOCK_SP_OIDC_AUTHORISATION_CODE,
  MOCK_SP_OIDC_EXTRACTED_NDI_PAYLOAD,
  MOCK_SP_OIDC_JWT_PAYLOAD,
  MOCK_SP_SAML,
  MOCK_TARGET,
} from './spcp.test.constants'

jest.mock('../spcp.oidc.client')

jest.mock('../spcp.service')
const MockSpcpService = mocked(SpcpService, true)
jest.mock('../spcp.oidc.service/spcp.oidc.service.sp')
const MockSpOidcServiceClass = mocked(SpOidcServiceClass, true)
jest.mock('../spcp.oidc.service/spcp.oidc.service.cp')
const MockCpOidcServiceClass = mocked(CpOidcServiceClass, true)
jest.mock('../../billing/billing.service')
const MockBillingService = mocked(BillingService, true)
jest.mock('src/app/modules/form/form.service')
const MockFormService = mocked(FormService, true)
jest.mock('src/app/config/config')
const MockConfig = mocked(config, true)
MockConfig.isDev = false

const MOCK_RESPONSE = expressHandler.mockResponse()
const MOCK_SP_LOGIN_REQ = expressHandler.mockRequest({
  query: { SAMLart: MOCK_SP_SAML, RelayState: MOCK_RELAY_STATE },
})
const MOCK_CP_LOGIN_REQ = expressHandler.mockRequest({
  query: { SAMLart: MOCK_CP_SAML, RelayState: MOCK_RELAY_STATE },
})

const MOCK_SPOIDC_LOGIN_REQ = expressHandler.mockRequest({
  query: { state: MOCK_OIDC_STATE, code: MOCK_SP_OIDC_AUTHORISATION_CODE },
})
const MOCK_CPOIDC_LOGIN_REQ = expressHandler.mockRequest({
  query: { state: MOCK_OIDC_STATE, code: MOCK_CP_OIDC_AUTHORISATION_CODE },
})

describe('spcp.controller', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('handleLogin', () => {
    describe('(Singpass)', () => {
      const loginHandler = SpcpController.handleLogin(FormAuthType.SP)

      beforeEach(() => {
        MockSpcpService.parseOOBParams.mockReturnValue(
          ok({
            formId: MOCK_TARGET,
            destination: MOCK_DESTINATION,
            rememberMe: MOCK_REMEMBER_ME,
            cookieDuration: MOCK_COOKIE_AGE,
            samlArt: MOCK_SP_SAML,
          }),
        )
        MockFormService.retrieveFullFormById.mockReturnValue(
          okAsync(MOCK_SP_FORM),
        )
        MockSpcpService.getSpcpAttributes.mockReturnValue(
          okAsync(MOCK_ATTRIBUTES),
        )
        MockSpcpService.createJWTPayload.mockReturnValue(ok(MOCK_JWT_PAYLOAD))
        MockSpcpService.createJWT.mockReturnValue(ok(MOCK_JWT))
        MockBillingService.recordLoginByForm.mockReturnValue(
          okAsync(MOCK_LOGIN_DOC),
        )
        MockSpcpService.getCookieSettings.mockReturnValue(MOCK_COOKIE_SETTINGS)
      })

      it('should set the cookie with the correct params and redirect to the destination', async () => {
        await loginHandler(MOCK_SP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.SP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MockSpcpService.getSpcpAttributes).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_DESTINATION,
          FormAuthType.SP,
        )
        expect(MockSpcpService.createJWTPayload).toHaveBeenCalledWith(
          MOCK_ATTRIBUTES,
          MOCK_REMEMBER_ME,
          FormAuthType.SP,
        )
        expect(MockSpcpService.createJWT).toHaveBeenCalledWith(
          MOCK_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
          FormAuthType.SP,
        )
        expect(MockBillingService.recordLoginByForm).toHaveBeenCalledWith(
          MOCK_SP_FORM,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('jwtSp', MOCK_JWT, {
          maxAge: MOCK_COOKIE_AGE,
          httpOnly: true,
          sameSite: 'lax',
          secure: !MockConfig.isDev,
          ...MOCK_COOKIE_SETTINGS,
        })
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
      })

      it('should return 400 when params cannot be parsed', async () => {
        MockSpcpService.parseOOBParams.mockReturnValue(
          err(new InvalidOOBParamsError()),
        )
        await loginHandler(MOCK_SP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.SP,
        )
        expect(MOCK_RESPONSE.sendStatus).toHaveBeenCalledWith(400)
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.redirect).not.toHaveBeenCalled()
        expect(MockFormService.retrieveFullFormById).not.toHaveBeenCalled()
        expect(MockSpcpService.getSpcpAttributes).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWTPayload).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
      })

      it('should return 404 when form cannot be found', async () => {
        MockFormService.retrieveFullFormById.mockReturnValue(
          errAsync(new FormNotFoundError()),
        )
        await loginHandler(MOCK_SP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.SP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MOCK_RESPONSE.sendStatus).toHaveBeenCalledWith(404)
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.redirect).not.toHaveBeenCalled()
        expect(MockSpcpService.getSpcpAttributes).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWTPayload).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when form has wrong auth type', async () => {
        MockFormService.retrieveFullFormById.mockReturnValue(
          // Note that this is a CorpPass form
          okAsync(MOCK_CP_FORM),
        )
        await loginHandler(MOCK_SP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.SP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(MockSpcpService.getSpcpAttributes).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWTPayload).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when getSpcpAttributes errors', async () => {
        MockSpcpService.getSpcpAttributes.mockReturnValue(
          errAsync(new RetrieveAttributesError()),
        )
        await loginHandler(MOCK_SP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.SP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MockSpcpService.getSpcpAttributes).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_DESTINATION,
          FormAuthType.SP,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(MockSpcpService.createJWTPayload).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when createJWTPayload errors', async () => {
        MockSpcpService.createJWTPayload.mockReturnValue(
          err(new MissingAttributesError()),
        )
        await loginHandler(MOCK_SP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.SP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MockSpcpService.getSpcpAttributes).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_DESTINATION,
          FormAuthType.SP,
        )
        expect(MockSpcpService.createJWTPayload).toHaveBeenCalledWith(
          MOCK_ATTRIBUTES,
          MOCK_REMEMBER_ME,
          FormAuthType.SP,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(MockSpcpService.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when createJWT errors', async () => {
        MockSpcpService.createJWT.mockReturnValue(err(new ApplicationError()))
        await loginHandler(MOCK_SP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.SP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MockSpcpService.getSpcpAttributes).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_DESTINATION,
          FormAuthType.SP,
        )
        expect(MockSpcpService.createJWTPayload).toHaveBeenCalledWith(
          MOCK_ATTRIBUTES,
          MOCK_REMEMBER_ME,
          FormAuthType.SP,
        )
        expect(MockSpcpService.createJWT).toHaveBeenCalledWith(
          MOCK_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
          FormAuthType.SP,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when recordLoginByForm errors', async () => {
        MockBillingService.recordLoginByForm.mockReturnValue(
          errAsync(new DatabaseError()),
        )
        await loginHandler(MOCK_SP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.SP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MockSpcpService.getSpcpAttributes).toHaveBeenCalledWith(
          MOCK_SP_SAML,
          MOCK_DESTINATION,
          FormAuthType.SP,
        )
        expect(MockSpcpService.createJWTPayload).toHaveBeenCalledWith(
          MOCK_ATTRIBUTES,
          MOCK_REMEMBER_ME,
          FormAuthType.SP,
        )
        expect(MockSpcpService.createJWT).toHaveBeenCalledWith(
          MOCK_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
          FormAuthType.SP,
        )
        expect(MockBillingService.recordLoginByForm).toHaveBeenCalledWith(
          MOCK_SP_FORM,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })
    })

    describe('(Corppass)', () => {
      const loginHandler = SpcpController.handleLogin(FormAuthType.CP)

      beforeEach(() => {
        MockSpcpService.parseOOBParams.mockReturnValue(
          ok({
            formId: MOCK_TARGET,
            destination: MOCK_DESTINATION,
            rememberMe: MOCK_REMEMBER_ME,
            cookieDuration: MOCK_COOKIE_AGE,
            samlArt: MOCK_CP_SAML,
          }),
        )
        MockFormService.retrieveFullFormById.mockReturnValue(
          okAsync(MOCK_CP_FORM),
        )
        MockSpcpService.getSpcpAttributes.mockReturnValue(
          okAsync(MOCK_ATTRIBUTES),
        )
        MockSpcpService.createJWTPayload.mockReturnValue(ok(MOCK_JWT_PAYLOAD))
        MockSpcpService.createJWT.mockReturnValue(ok(MOCK_JWT))
        MockBillingService.recordLoginByForm.mockReturnValue(
          okAsync(MOCK_LOGIN_DOC),
        )
        MockSpcpService.getCookieSettings.mockReturnValue(MOCK_COOKIE_SETTINGS)
      })

      it('should set the cookie with the correct params and redirect to the destination', async () => {
        await loginHandler(MOCK_CP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.CP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MockSpcpService.getSpcpAttributes).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_DESTINATION,
          FormAuthType.CP,
        )
        expect(MockSpcpService.createJWTPayload).toHaveBeenCalledWith(
          MOCK_ATTRIBUTES,
          MOCK_REMEMBER_ME,
          FormAuthType.CP,
        )
        expect(MockSpcpService.createJWT).toHaveBeenCalledWith(
          MOCK_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
          FormAuthType.CP,
        )
        expect(MockBillingService.recordLoginByForm).toHaveBeenCalledWith(
          MOCK_CP_FORM,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('jwtCp', MOCK_JWT, {
          maxAge: MOCK_COOKIE_AGE,
          httpOnly: true,
          sameSite: 'lax',
          secure: !MockConfig.isDev,
          ...MOCK_COOKIE_SETTINGS,
        })
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
      })

      it('should return 400 when params cannot be parsed', async () => {
        MockSpcpService.parseOOBParams.mockReturnValue(
          err(new InvalidOOBParamsError()),
        )
        await loginHandler(MOCK_CP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.CP,
        )
        expect(MOCK_RESPONSE.sendStatus).toHaveBeenCalledWith(400)
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.redirect).not.toHaveBeenCalled()
        expect(MockFormService.retrieveFullFormById).not.toHaveBeenCalled()
        expect(MockSpcpService.getSpcpAttributes).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWTPayload).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when form has wrong auth type', async () => {
        MockFormService.retrieveFullFormById.mockReturnValue(
          // Note that this is a SingPass form
          okAsync(MOCK_SP_FORM),
        )
        await loginHandler(MOCK_CP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.CP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(MockSpcpService.getSpcpAttributes).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWTPayload).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should return 404 when form cannot be found', async () => {
        MockFormService.retrieveFullFormById.mockReturnValue(
          errAsync(new FormNotFoundError()),
        )
        await loginHandler(MOCK_CP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.CP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MOCK_RESPONSE.sendStatus).toHaveBeenCalledWith(404)
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.redirect).not.toHaveBeenCalled()
        expect(MockSpcpService.getSpcpAttributes).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWTPayload).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when getSpcpAttributes errors', async () => {
        MockSpcpService.getSpcpAttributes.mockReturnValue(
          errAsync(new RetrieveAttributesError()),
        )
        await loginHandler(MOCK_CP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.CP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MockSpcpService.getSpcpAttributes).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_DESTINATION,
          FormAuthType.CP,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(MockSpcpService.createJWTPayload).not.toHaveBeenCalled()
        expect(MockSpcpService.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when createJWTPayload errors', async () => {
        MockSpcpService.createJWTPayload.mockReturnValue(
          err(new MissingAttributesError()),
        )
        await loginHandler(MOCK_CP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.CP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MockSpcpService.getSpcpAttributes).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_DESTINATION,
          FormAuthType.CP,
        )
        expect(MockSpcpService.createJWTPayload).toHaveBeenCalledWith(
          MOCK_ATTRIBUTES,
          MOCK_REMEMBER_ME,
          FormAuthType.CP,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(MockSpcpService.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when createJWT errors', async () => {
        MockSpcpService.createJWT.mockReturnValue(err(new ApplicationError()))
        await loginHandler(MOCK_CP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.CP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MockSpcpService.getSpcpAttributes).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_DESTINATION,
          FormAuthType.CP,
        )
        expect(MockSpcpService.createJWTPayload).toHaveBeenCalledWith(
          MOCK_ATTRIBUTES,
          MOCK_REMEMBER_ME,
          FormAuthType.CP,
        )
        expect(MockSpcpService.createJWT).toHaveBeenCalledWith(
          MOCK_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
          FormAuthType.CP,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when recordLoginByForm errors', async () => {
        MockBillingService.recordLoginByForm.mockReturnValue(
          errAsync(new DatabaseError()),
        )
        await loginHandler(MOCK_CP_LOGIN_REQ, MOCK_RESPONSE, jest.fn())
        expect(MockSpcpService.parseOOBParams).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_RELAY_STATE,
          FormAuthType.CP,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MockSpcpService.getSpcpAttributes).toHaveBeenCalledWith(
          MOCK_CP_SAML,
          MOCK_DESTINATION,
          FormAuthType.CP,
        )
        expect(MockSpcpService.createJWTPayload).toHaveBeenCalledWith(
          MOCK_ATTRIBUTES,
          MOCK_REMEMBER_ME,
          FormAuthType.CP,
        )
        expect(MockSpcpService.createJWT).toHaveBeenCalledWith(
          MOCK_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
          FormAuthType.CP,
        )
        expect(MockBillingService.recordLoginByForm).toHaveBeenCalledWith(
          MOCK_CP_FORM,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })
    })
  })

  describe('handleSpcpOidcLogin', () => {
    describe('(Singpass)', () => {
      const loginHandler = SpcpController.handleSpcpOidcLogin(FormAuthType.SP)

      const mockSpOidcServiceClass = mocked(
        MockSpOidcServiceClass.mock.instances[0],
        true,
      )

      beforeEach(() => {
        mockSpOidcServiceClass.exchangeAuthCodeAndRetrieveData.mockReturnValue(
          okAsync(MOCK_SP_OIDC_EXTRACTED_NDI_PAYLOAD),
        )

        mockSpOidcServiceClass.parseState.mockReturnValue(
          ok({
            formId: MOCK_TARGET,
            destination: MOCK_DESTINATION,
            rememberMe: MOCK_REMEMBER_ME,
            cookieDuration: MOCK_COOKIE_AGE,
          }),
        )

        MockFormService.retrieveFullFormById.mockReturnValue(
          okAsync(MOCK_SP_FORM),
        )

        mockSpOidcServiceClass.createJWTPayload.mockReturnValue(
          ok(MOCK_SP_OIDC_JWT_PAYLOAD),
        )
        mockSpOidcServiceClass.createJWT.mockResolvedValue(ok(MOCK_JWT))
        MockBillingService.recordLoginByForm.mockReturnValue(
          okAsync(MOCK_LOGIN_DOC),
        )
        mockSpOidcServiceClass.getCookieSettings.mockReturnValue(
          MOCK_COOKIE_SETTINGS,
        )
      })

      it('should set the cookie with the correct params and redirect to the destination', async () => {
        // Arrange
        mockSpOidcServiceClass.jwtName = JwtName.SP

        // Act
        await loginHandler(MOCK_SPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert
        expect(
          mockSpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_SP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockSpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(mockSpOidcServiceClass.createJWTPayload).toHaveBeenCalledWith(
          MOCK_SP_OIDC_EXTRACTED_NDI_PAYLOAD,
          MOCK_REMEMBER_ME,
        )
        expect(mockSpOidcServiceClass.createJWT).toHaveBeenCalledWith(
          MOCK_SP_OIDC_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
        )
        expect(MockBillingService.recordLoginByForm).toHaveBeenCalledWith(
          MOCK_SP_FORM,
        )

        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('jwtSp', MOCK_JWT, {
          maxAge: MOCK_COOKIE_AGE,
          httpOnly: true,
          sameSite: 'lax',
          secure: !MockConfig.isDev,
          ...MOCK_COOKIE_SETTINGS,
        })
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
      })

      it('should return 400 when token exchange fails', async () => {
        // Arrange

        mockSpOidcServiceClass.exchangeAuthCodeAndRetrieveData.mockReturnValue(
          errAsync(new InvalidIdTokenError()),
        )

        // Act
        await loginHandler(MOCK_SPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert
        expect(
          mockSpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_SP_OIDC_AUTHORISATION_CODE)
        expect(MOCK_RESPONSE.sendStatus).toHaveBeenCalledWith(400)
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.redirect).not.toHaveBeenCalled()
        expect(MockFormService.retrieveFullFormById).not.toHaveBeenCalled()
        expect(mockSpOidcServiceClass.parseState).not.toHaveBeenCalled()
        expect(mockSpOidcServiceClass.createJWTPayload).not.toHaveBeenCalled()
        expect(mockSpOidcServiceClass.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(mockSpOidcServiceClass.getCookieSettings).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
      })

      it('should return 400 when parse state fails', async () => {
        // Arrange

        mockSpOidcServiceClass.parseState.mockReturnValueOnce(
          err(new InvalidStateError()),
        )

        // Act
        await loginHandler(MOCK_SPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert
        expect(
          mockSpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_SP_OIDC_AUTHORISATION_CODE)
        expect(mockSpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(MOCK_RESPONSE.sendStatus).toHaveBeenCalledWith(400)
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.redirect).not.toHaveBeenCalled()
        expect(MockFormService.retrieveFullFormById).not.toHaveBeenCalled()
        expect(mockSpOidcServiceClass.createJWTPayload).not.toHaveBeenCalled()
        expect(mockSpOidcServiceClass.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(mockSpOidcServiceClass.getCookieSettings).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
      })

      it('should return 404 when form cannot be found', async () => {
        // Arrange

        MockFormService.retrieveFullFormById.mockReturnValueOnce(
          errAsync(new FormNotFoundError()),
        )

        // Act

        await loginHandler(MOCK_SPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert
        expect(
          mockSpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_SP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockSpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MOCK_RESPONSE.sendStatus).toHaveBeenCalledWith(404)
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.redirect).not.toHaveBeenCalled()
        expect(mockSpOidcServiceClass.createJWTPayload).not.toHaveBeenCalled()
        expect(mockSpOidcServiceClass.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(mockSpOidcServiceClass.getCookieSettings).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when form has wrong auth type', async () => {
        // Arrange
        MockFormService.retrieveFullFormById.mockReturnValue(
          // Note that this is a CorpPass form
          okAsync(MOCK_CP_FORM),
        )

        // Act
        await loginHandler(MOCK_SPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert
        expect(
          mockSpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_SP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockSpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(mockSpOidcServiceClass.createJWTPayload).not.toHaveBeenCalled()
        expect(mockSpOidcServiceClass.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when createJWTPayload errors', async () => {
        // Arrange
        mockSpOidcServiceClass.createJWTPayload.mockReturnValue(
          err(new MissingAttributesError()),
        )

        // Act
        await loginHandler(MOCK_SPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert

        expect(
          mockSpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_SP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockSpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(mockSpOidcServiceClass.createJWTPayload).toHaveBeenCalledWith(
          MOCK_SP_OIDC_EXTRACTED_NDI_PAYLOAD,
          MOCK_REMEMBER_ME,
        )

        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(mockSpOidcServiceClass.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when createJWT errors', async () => {
        // Arrange
        mockSpOidcServiceClass.createJWT.mockReturnValue(
          errAsync(new CreateJwtError()),
        )

        // Act
        await loginHandler(MOCK_SPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert

        expect(
          mockSpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_SP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockSpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(mockSpOidcServiceClass.createJWTPayload).toHaveBeenCalledWith(
          MOCK_SP_OIDC_EXTRACTED_NDI_PAYLOAD,
          MOCK_REMEMBER_ME,
        )

        expect(mockSpOidcServiceClass.createJWT).toHaveBeenCalledWith(
          MOCK_SP_OIDC_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)

        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when recordLoginByForm errors', async () => {
        // Arrange
        MockBillingService.recordLoginByForm.mockReturnValue(
          errAsync(new DatabaseError()),
        )

        // Act
        await loginHandler(MOCK_SPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert

        expect(
          mockSpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_SP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockSpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(mockSpOidcServiceClass.createJWTPayload).toHaveBeenCalledWith(
          MOCK_SP_OIDC_EXTRACTED_NDI_PAYLOAD,
          MOCK_REMEMBER_ME,
        )

        expect(mockSpOidcServiceClass.createJWT).toHaveBeenCalledWith(
          MOCK_SP_OIDC_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)

        expect(MockBillingService.recordLoginByForm).toHaveBeenCalledWith(
          MOCK_SP_FORM,
        )
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })
    })
    describe('(Corppass)', () => {
      const loginHandler = SpcpController.handleSpcpOidcLogin(FormAuthType.CP)

      const mockCpOidcServiceClass = mocked(
        MockCpOidcServiceClass.mock.instances[0],
        true,
      )

      beforeEach(() => {
        mockCpOidcServiceClass.exchangeAuthCodeAndRetrieveData.mockReturnValue(
          okAsync(MOCK_CP_OIDC_EXTRACTED_NDI_PAYLOAD),
        )

        mockCpOidcServiceClass.parseState.mockReturnValue(
          ok({
            formId: MOCK_TARGET,
            destination: MOCK_DESTINATION,
            rememberMe: MOCK_REMEMBER_ME,
            cookieDuration: MOCK_COOKIE_AGE,
          }),
        )

        MockFormService.retrieveFullFormById.mockReturnValue(
          okAsync(MOCK_CP_FORM),
        )

        mockCpOidcServiceClass.createJWTPayload.mockReturnValue(
          ok(MOCK_CP_OIDC_JWT_PAYLOAD),
        )
        mockCpOidcServiceClass.createJWT.mockResolvedValue(ok(MOCK_JWT))
        MockBillingService.recordLoginByForm.mockReturnValue(
          okAsync(MOCK_LOGIN_DOC),
        )
        mockCpOidcServiceClass.getCookieSettings.mockReturnValue(
          MOCK_COOKIE_SETTINGS,
        )
      })

      it('should set the cookie with the correct params and redirect to the destination', async () => {
        // Arrange
        mockCpOidcServiceClass.jwtName = JwtName.CP

        // Act
        await loginHandler(MOCK_CPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert
        expect(
          mockCpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_CP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockCpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(mockCpOidcServiceClass.createJWTPayload).toHaveBeenCalledWith(
          MOCK_CP_OIDC_EXTRACTED_NDI_PAYLOAD,
          MOCK_REMEMBER_ME,
        )
        expect(mockCpOidcServiceClass.createJWT).toHaveBeenCalledWith(
          MOCK_CP_OIDC_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
        )
        expect(MockBillingService.recordLoginByForm).toHaveBeenCalledWith(
          MOCK_CP_FORM,
        )

        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('jwtCp', MOCK_JWT, {
          maxAge: MOCK_COOKIE_AGE,
          httpOnly: true,
          sameSite: 'lax',
          secure: !MockConfig.isDev,
          ...MOCK_COOKIE_SETTINGS,
        })
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
      })

      it('should return 400 when token exchange fails', async () => {
        // Arrange

        mockCpOidcServiceClass.exchangeAuthCodeAndRetrieveData.mockReturnValue(
          errAsync(new InvalidIdTokenError()),
        )

        // Act
        await loginHandler(MOCK_CPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert
        expect(
          mockCpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_CP_OIDC_AUTHORISATION_CODE)
        expect(MOCK_RESPONSE.sendStatus).toHaveBeenCalledWith(400)
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.redirect).not.toHaveBeenCalled()
        expect(MockFormService.retrieveFullFormById).not.toHaveBeenCalled()
        expect(mockCpOidcServiceClass.parseState).not.toHaveBeenCalled()
        expect(mockCpOidcServiceClass.createJWTPayload).not.toHaveBeenCalled()
        expect(mockCpOidcServiceClass.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(mockCpOidcServiceClass.getCookieSettings).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
      })

      it('should return 400 when parse state fails', async () => {
        // Arrange

        mockCpOidcServiceClass.parseState.mockReturnValueOnce(
          err(new InvalidStateError()),
        )

        // Act
        await loginHandler(MOCK_CPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert
        expect(
          mockCpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_CP_OIDC_AUTHORISATION_CODE)
        expect(mockCpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(MOCK_RESPONSE.sendStatus).toHaveBeenCalledWith(400)
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.redirect).not.toHaveBeenCalled()
        expect(MockFormService.retrieveFullFormById).not.toHaveBeenCalled()
        expect(mockCpOidcServiceClass.createJWTPayload).not.toHaveBeenCalled()
        expect(mockCpOidcServiceClass.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(mockCpOidcServiceClass.getCookieSettings).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
      })

      it('should return 404 when form cannot be found', async () => {
        // Arrange

        MockFormService.retrieveFullFormById.mockReturnValueOnce(
          errAsync(new FormNotFoundError()),
        )

        // Act

        await loginHandler(MOCK_CPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert
        expect(
          mockCpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_CP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockCpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(MOCK_RESPONSE.sendStatus).toHaveBeenCalledWith(404)
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.redirect).not.toHaveBeenCalled()
        expect(mockCpOidcServiceClass.createJWTPayload).not.toHaveBeenCalled()
        expect(mockCpOidcServiceClass.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(mockCpOidcServiceClass.getCookieSettings).not.toHaveBeenCalled()
        expect(MOCK_RESPONSE.cookie).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when form has wrong auth type', async () => {
        // Arrange
        MockFormService.retrieveFullFormById.mockReturnValue(
          // Note that this is a SingPass form
          okAsync(MOCK_SP_FORM),
        )

        // Act
        await loginHandler(MOCK_CPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert
        expect(
          mockCpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_CP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockCpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(mockCpOidcServiceClass.createJWTPayload).not.toHaveBeenCalled()
        expect(mockCpOidcServiceClass.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when createJWTPayload errors', async () => {
        // Arrange
        mockCpOidcServiceClass.createJWTPayload.mockReturnValue(
          err(new MissingAttributesError()),
        )

        // Act
        await loginHandler(MOCK_CPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert

        expect(
          mockCpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_CP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockCpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(mockCpOidcServiceClass.createJWTPayload).toHaveBeenCalledWith(
          MOCK_CP_OIDC_EXTRACTED_NDI_PAYLOAD,
          MOCK_REMEMBER_ME,
        )

        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)
        expect(mockCpOidcServiceClass.createJWT).not.toHaveBeenCalled()
        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when createJWT errors', async () => {
        // Arrange
        mockCpOidcServiceClass.createJWT.mockReturnValue(
          errAsync(new CreateJwtError()),
        )

        // Act
        await loginHandler(MOCK_CPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert

        expect(
          mockCpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_CP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockCpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(mockCpOidcServiceClass.createJWTPayload).toHaveBeenCalledWith(
          MOCK_CP_OIDC_EXTRACTED_NDI_PAYLOAD,
          MOCK_REMEMBER_ME,
        )

        expect(mockCpOidcServiceClass.createJWT).toHaveBeenCalledWith(
          MOCK_CP_OIDC_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)

        expect(MockBillingService.recordLoginByForm).not.toHaveBeenCalled()
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })

      it('should set isLoginError cookie and redirect when recordLoginByForm errors', async () => {
        // Arrange
        MockBillingService.recordLoginByForm.mockReturnValue(
          errAsync(new DatabaseError()),
        )

        // Act
        await loginHandler(MOCK_CPOIDC_LOGIN_REQ, MOCK_RESPONSE, jest.fn())

        // Assert

        expect(
          mockCpOidcServiceClass.exchangeAuthCodeAndRetrieveData,
        ).toHaveBeenCalledWith(MOCK_CP_OIDC_AUTHORISATION_CODE)
        expect(MockFormService.retrieveFullFormById).toHaveBeenCalledWith(
          MOCK_TARGET,
        )
        expect(mockCpOidcServiceClass.parseState).toHaveBeenCalledWith(
          MOCK_OIDC_STATE,
        )
        expect(mockCpOidcServiceClass.createJWTPayload).toHaveBeenCalledWith(
          MOCK_CP_OIDC_EXTRACTED_NDI_PAYLOAD,
          MOCK_REMEMBER_ME,
        )

        expect(mockCpOidcServiceClass.createJWT).toHaveBeenCalledWith(
          MOCK_CP_OIDC_JWT_PAYLOAD,
          MOCK_COOKIE_AGE,
        )
        expect(MOCK_RESPONSE.cookie).toHaveBeenCalledWith('isLoginError', true)
        expect(MOCK_RESPONSE.redirect).toHaveBeenCalledWith(MOCK_DESTINATION)

        expect(MockBillingService.recordLoginByForm).toHaveBeenCalledWith(
          MOCK_CP_FORM,
        )
        expect(MockSpcpService.getCookieSettings).not.toHaveBeenCalled()
      })
    })
  })
})

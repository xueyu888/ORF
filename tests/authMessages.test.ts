import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/state/apiClient";
import { authFailureMessage } from "../src/state/OrfProvider";

test("auth failure messages preserve backend service outage detail", () => {
  assert.equal(
    authFailureMessage(new ApiError(503, "/api/auth/login", "数据服务暂时不可用，请稍后重试。"), "login"),
    "数据服务暂时不可用，请稍后重试。",
  );
  assert.equal(
    authFailureMessage(new ApiError(503, "/api/auth/login", "认证服务暂时不可用，请稍后重试。"), "login"),
    "认证服务暂时不可用，请稍后重试。",
  );
});

test("auth failure messages still hide credential failure details", () => {
  assert.equal(authFailureMessage(new ApiError(401, "/api/auth/login", "Invalid email or password"), "login"), "账号或密码不正确");
  assert.equal(authFailureMessage(new ApiError(400, "/api/auth/registration", "Registration failed"), "registration"), "注册失败，请检查邮箱和密码");
});

test("auth failure messages preserve default-team binding failures", () => {
  assert.equal(authFailureMessage(new ApiError(403, "/api/auth/login", "账号未加入当前默认团队，请联系管理员。"), "login"), "账号未加入当前默认团队，请联系管理员。");
});

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AnimatedList } from "./AnimatedList";

test("renders an accessible animated list with one motion item per visible option", () => {
  const html = renderToStaticMarkup(
    <AnimatedList as="ul" className="test-list" ariaLabel="测试列表">
      <button type="button">项目研究边界</button>
      <button type="button">拓扑修复预览</button>
    </AnimatedList>,
  );

  assert.match(html, /<ul[^>]*aria-label="测试列表"/);
  assert.equal((html.match(/class="animated-list-item"/g) ?? []).length, 2);
  assert.match(html, /项目研究边界/);
  assert.match(html, /拓扑修复预览/);
});

import asyncio

from app.main import (
    acquire_kernel_creation_guard,
    kernel_creation_guards,
    release_kernel_creation_guard,
)


def test_same_notebook_uses_one_creation_guard():
    async def scenario():
        key = ("user-a", "runtime-a", "notebook-a")
        first = await acquire_kernel_creation_guard(key)
        waiting = asyncio.create_task(acquire_kernel_creation_guard(key))
        await asyncio.sleep(0)
        assert not waiting.done()
        await release_kernel_creation_guard(key, first)
        second = await waiting
        assert second is first
        await release_kernel_creation_guard(key, second)
        assert key not in kernel_creation_guards

    asyncio.run(scenario())


def test_different_notebooks_do_not_block_each_other():
    async def scenario():
        first_key = ("user-a", "runtime-a", "notebook-a")
        second_key = ("user-a", "runtime-a", "notebook-b")
        first = await acquire_kernel_creation_guard(first_key)
        second = await asyncio.wait_for(
            acquire_kernel_creation_guard(second_key), timeout=0.2
        )
        await release_kernel_creation_guard(second_key, second)
        await release_kernel_creation_guard(first_key, first)
        assert kernel_creation_guards == {}

    asyncio.run(scenario())
